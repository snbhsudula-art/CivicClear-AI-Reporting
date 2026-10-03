import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RESIDENT_STEPS, createResidentReport, getResidentProgress, latestResidentReport,
  residentAnalysisInput, residentNextStepMessage, validateResidentStep, type ResidentFormState,
} from './resident-experience.ts';
import { CHECK_FIELDS, getReportReadiness, routingHeld, type Report, type ReportAnalysis } from './report-analysis.ts';

const sample: Report = {
  id: 'DEMO', submittedAt: '2026-10-01T10:00:00Z', residentName: 'Demo',
  description: 'Illustrative example', location: 'Downtown San José', issueType: 'Other', urgency: 'Low',
  status: 'Human Review', issue: 'Example', summaryLocation: 'Downtown San José',
  structuredIssueType: 'Other', structuredUrgency: 'Low', structuredDescription: 'Example',
  previousCityAction: 'Unknown', missingInformation: [], suggestedDepartment: 'Routing held',
  humanEdits: '', reviewNote: '',
};
const form: ResidentFormState = {
  residentName: 'Synthetic name not sent', description: 'An unknown container is actively leaking liquid with a strong chemical smell.',
  location: 'Downtown San José', issueType: 'Other', urgency: 'Low', observedAt: 'Today',
  requestedDepartment: 'Housing', danger: 'Not dangerous',
};
const result: ReportAnalysis = {
  analysisVersion: 1, routingBlocked: true,
  assessments: CHECK_FIELDS.map(field => ({
    field, state: field === 'date' ? 'consistent' : 'uncertain', evidence: [],
    explanation: 'Needs human verification.', question: field === 'date' ? '' : `Please clarify ${field}.`,
  })),
  safetyConcern: {
    possibleHazard: true, recommendedUrgency: 'High',
    evidence: ['actively leaking liquid', 'strong chemical smell'],
    explanation: 'Possible, unconfirmed chemical concern.',
  },
  draft: { issue: 'Possible chemical leak', location: 'Unknown', issueType: 'Other', urgency: 'High',
    description: form.description, observedAt: 'Today', department: 'Routing held', danger: 'Possible hazard' },
  missingInformation: ['Exact address or nearest cross street'],
};

test('five reporting steps have the requested order and reject blank descriptions without requiring an address', () => {
  assert.deepEqual(RESIDENT_STEPS, [
    'What happened?', 'Where did you notice it?', 'How urgent is it?', 'Review your report', 'Submit',
  ]);
  for (const step of [0, 3, 4]) assert.match(validateResidentStep(step, { ...form, description: '  ' }), /describe/);
  for (let step = 0; step < 5; step++) {
    assert.equal(validateResidentStep(step, { ...form, location: '', observedAt: '', danger: 'Not sure' }), '');
  }
  assert.equal(validateResidentStep(1, { ...form, location: 'Downtown San José' }), '');
});

test('wizard request retains exactly the existing API fields and never includes the name', () => {
  const input = residentAnalysisInput(form);
  assert.deepEqual(Object.keys(input).sort(), [
    'danger', 'description', 'issueType', 'location', 'observedAt', 'requestedDepartment', 'urgency',
  ]);
  assert.equal(input.description, form.description);
  assert.equal(input.location, form.location);
  assert.equal(input.urgency, 'Low');
  assert.equal(input.danger, 'Not dangerous');
  assert.ok(!('residentName' in input));
});

test('creating a report retains original input, hazard recommendation, source evidence and holds', () => {
  const staleSample = { ...sample, resolutions: { danger: {
    value: 'Safe', note: 'Old demo verification', reviewer: 'Demo', resolvedAt: sample.submittedAt,
  } }, pendingDraftReview: { location: { previous: ['Old'], proposed: ['New'] } } };
  const snapshot = JSON.stringify(staleSample);
  const report = createResidentReport(staleSample, form, result, 'NEW', '2026-10-03T12:00:00Z');
  assert.equal(report.id, 'NEW');
  assert.equal(report.description, form.description);
  assert.equal(report.location, form.location);
  assert.equal(report.residentName, form.residentName);
  assert.equal(report.urgency, 'Low');
  assert.equal(report.structuredUrgency, 'High');
  assert.equal(report.sourceDanger, 'Not dangerous');
  assert.equal(report.sourceObservedAt, 'Today');
  assert.deepEqual(report.analysis, result);
  assert.deepEqual(report.resolutions, {});
  assert.deepEqual(report.pendingDraftReview, {});
  assert.deepEqual(report.resolutionHistory, []);
  assert.equal(routingHeld(report), true);
  assert.ok(getReportReadiness(report).score < 50);
  assert.equal(JSON.stringify(staleSample), snapshot);
});

test('home and tracking distinguish the seeded example from real saved submissions without deleting records', () => {
  const records = [sample];
  assert.equal(latestResidentReport(records, sample.id), null);
  const real = createResidentReport(sample, form, result, 'REAL', sample.submittedAt);
  assert.equal(latestResidentReport([real, sample], sample.id), real);
  assert.equal(latestResidentReport([sample, real], sample.id), real);
  assert.deepEqual(records, [sample]);
});

test('tracking marks analysis complete after detecting gaps, not after resolving them', () => {
  const report = createResidentReport(sample, form, result, 'REAL', sample.submittedAt);
  assert.equal(report.status, 'More Information Requested');
  assert.deepEqual(getResidentProgress(report), [
    { label: 'Report Submitted', state: 'complete' }, { label: 'In Progress', state: 'complete' },
    { label: 'Human Review', state: 'current' }, { label: 'Decision', state: 'upcoming' },
  ]);
  assert.equal(routingHeld(report), true);
});

test('only explicit human decisions complete the final stage, including rejection', () => {
  const report = createResidentReport(sample, form, result, 'REAL', sample.submittedAt);
  for (const status of ['AI Structured', 'Human Review', 'More Information Requested'] as const) {
    assert.equal(getResidentProgress({ ...report, status })[3].state, 'upcoming');
  }
  for (const status of ['Human Approved', 'Recommendation Rejected'] as const) {
    assert.ok(getResidentProgress({ ...report, status }).every(stage => stage.state === 'complete'));
  }
});

test('legacy reports without analysis do not imply a check was performed', () => {
  assert.deepEqual(getResidentProgress(sample).map(stage => stage.state), ['complete', 'current', 'upcoming', 'upcoming']);
  assert.equal(getResidentProgress({ ...sample, status: 'Human Approved' })[1].state, 'not-performed');
});

test('tracking next steps reflect a recorded decision instead of promising another review', () => {
  const report = createResidentReport(sample, form, result, 'REAL', sample.submittedAt);
  assert.match(residentNextStepMessage(report), /unclear details/);
  assert.match(residentNextStepMessage(sample), /must run the details check/);
  assert.match(residentNextStepMessage({ ...report, status: 'Human Approved' }), /approved.*simulated decision/);
  assert.match(residentNextStepMessage({ ...report, status: 'Recommendation Rejected' }), /did not approve.*preserved/);
});