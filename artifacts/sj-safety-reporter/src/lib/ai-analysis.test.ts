import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAIAnalysis } from './ai-analysis.ts';
import {
  applyAnalysis, CHECK_FIELDS, getReportReadiness, recordClarification,
  routingHeld, saveHumanDraftEdits, type Report, type ReportAnalysis,
} from './report-analysis.ts';

const source: Report = {
  id: 'ANALYSIS-TEST', submittedAt: '2026-10-01T10:00:00Z', residentName: 'Synthetic',
  description: 'The sidewalk is blocked. The same sidewalk is clear.',
  location: '100 First Street', issueType: 'Trash / debris', urgency: 'Low',
  sourceObservedAt: 'Today', sourceDanger: 'Not dangerous', requestedDepartment: 'Public Works',
  status: 'Human Review', issue: 'Sidewalk debris', summaryLocation: '100 First Street',
  structuredIssueType: 'Trash / debris', structuredUrgency: 'Low', structuredDescription: 'Sidewalk debris',
  previousCityAction: 'Unknown', missingInformation: [], suggestedDepartment: 'Public Works',
  humanEdits: '', reviewNote: '',
};
const clear: ReportAnalysis = {
  analysisVersion: 1,
  assessments: CHECK_FIELDS.map(field => ({
    field, state: 'consistent', evidence: [], explanation: 'Resident-provided detail; not independently verified.', question: '',
  })),
  draft: { issue: 'Sidewalk debris', location: '100 First Street', issueType: 'Trash / debris',
    urgency: 'Low', description: 'Sidewalk debris', observedAt: 'Today',
    department: 'Public Works', danger: 'Not dangerous' },
  missingInformation: [], routingBlocked: false,
};
const conflict: ReportAnalysis = {
  ...clear, routingBlocked: true,
  assessments: clear.assessments.map(a => a.field === 'issue'
    ? { ...a, state: 'uncertain', evidence: ['The sidewalk is blocked.', 'The same sidewalk is clear.'],
      explanation: 'The resident supplied conflicting statements about blockage.', question: 'Is this sidewalk blocked or clear?' }
    : a),
};

test('legacy report does not invent a completed AI analysis or routing suggestion', () => {
  const view = buildAIAnalysis(source);
  assert.equal(view.available, false);
  assert.equal(view.held, true);
  assert.match(view.overall, /not yet available/);
  assert.deepEqual(view.evidence, []);
  assert.match(view.routing.candidate, /No department suggested/);
  assert.ok(view.findings.every(f => f.status !== 'Detected'));
});

test('analysis preserves both conflicting statements and separates missing information', () => {
  const report = applyAnalysis({ ...source, location: 'Downtown San José' }, {
    ...conflict,
    assessments: conflict.assessments.map(a => a.field === 'location'
      ? { ...a, state: 'missing', evidence: ['Downtown San José'], question: 'What is the exact address or cross street?' } : a),
    draft: { ...conflict.draft, location: 'Unknown' },
  });
  const view = buildAIAnalysis(report);
  assert.equal(view.held, true);
  assert.deepEqual(view.contradictions[0].evidence, ['The sidewalk is blocked.', 'The same sidewalk is clear.']);
  assert.equal(view.contradictions[0].status, 'Uncertain');
  assert.equal(view.findings.find(f => f.key === 'location')?.status, 'Needs Clarification');
  assert.ok(view.missingInformation.includes('What is the exact address or cross street?'));
  assert.ok(view.evidence.some(e => e.quote === 'Downtown San José'));
  assert.equal(report.location, 'Downtown San José');
});

test('potential hazards retain literal evidence and High recommendation separately from resident Low', () => {
  const description = 'A container is leaking liquid with a strong chemical smell.';
  const report = applyAnalysis({ ...source, description, location: '' }, {
    ...clear, routingBlocked: true,
    assessments: clear.assessments.map(a => a.field === 'danger' || a.field === 'urgency'
      ? { ...a, state: 'uncertain', question: `Please verify ${a.field}.` }
      : a.field === 'location' ? { ...a, state: 'missing', question: 'What is the exact address?' } : a),
    safetyConcern: { possibleHazard: true, recommendedUrgency: 'High',
      explanation: 'Reported indicators suggest a possible, unconfirmed hazard.',
      evidence: ['leaking liquid', 'strong chemical smell'] },
    draft: { ...clear.draft, urgency: 'High', location: 'Unknown' },
  });
  const view = buildAIAnalysis(report);
  assert.equal(view.hazard.possible, true);
  assert.equal(view.hazard.urgency, 'High');
  assert.equal(view.hazard.reviewed, false);
  assert.deepEqual(view.hazard.evidence, ['leaking liquid', 'strong chemical smell']);
  assert.match(view.findings[0].value, /not confirmed/);
  const urgency = view.findings.find(f => f.key === 'urgency');
  assert.equal(urgency?.value, 'High');
  assert.equal(urgency?.sourceValue, 'Low');
  assert.equal(view.held, true);
  assert.ok(getReportReadiness(report).score < 50);
});

test('resolved conflicts remain preserved; material edits require fresh review', () => {
  let report = applyAnalysis(source, conflict);
  report = recordClarification(report, 'issue', 'Sidewalk blocked', 'Resident clarified the affected sidewalk.');
  let view = buildAIAnalysis(report);
  assert.equal(view.held, false);
  assert.equal(view.contradictions[0].status, 'Human Review Recorded');
  assert.equal(view.contradictions[0].evidence.length, 2);
  assert.equal(view.contradictions[0].question, '');
  report = saveHumanDraftEdits(report, { ...report, summaryLocation: '999 Different Street' });
  view = buildAIAnalysis(report);
  const edited = view.contradictions.find(c => c.field === 'Location');
  assert.equal(edited?.status, 'Needs Clarification');
  assert.match(edited?.explanation ?? '', /100 First Street.*999 Different Street/);
  assert.equal(view.held, true);
  assert.ok(!view.evidence.some(e => e.quote.includes('999 Different Street')));
});

test('evidence excludes fabricated claims and draft-only details, deduplicating real quotes', () => {
  const report = applyAnalysis(source, {
    ...conflict,
    assessments: conflict.assessments.map(a => a.field === 'issue'
      ? { ...a, evidence: ['The sidewalk is blocked.', 'The sidewalk is blocked.', '', 'Invented emergency', 'Generated draft-only fact'] }
      : a),
    draft: { ...clear.draft, description: 'Generated draft-only fact' },
  });
  const view = buildAIAnalysis(report);
  assert.deepEqual(view.evidence.map(e => e.quote), ['The sidewalk is blocked.']);
  assert.deepEqual(view.contradictions[0].evidence, ['The sidewalk is blocked.']);
});

test('routing explanations treat requests as claims and analysis never mutates decisions or readiness', () => {
  const report = applyAnalysis({ ...source, requestedDepartment: 'Housing' }, clear);
  const before = JSON.stringify(report);
  const readiness = getReportReadiness(report);
  const view = buildAIAnalysis(report);
  assert.equal(view.routing.requested, 'Housing');
  assert.equal(view.routing.candidate, 'Public Works');
  assert.match(view.routing.explanation, /not an authoritative instruction/);
  assert.match(view.overall, /drafts for human review/);
  assert.equal(view.routing.status, 'Human Review Required');
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(getReportReadiness(report), readiness);
  assert.equal(routingHeld(report), false);
  assert.equal(report.status, 'AI Structured');
  assert.ok(!('confidence' in view));
});

test('human decisions are identified as demo decisions, not independent verification', () => {
  const approved = { ...applyAnalysis(source, clear), status: 'Human Approved' as const };
  assert.match(buildAIAnalysis(approved).humanDecision ?? '', /not a City decision/);
  assert.match(buildAIAnalysis({ ...approved, status: 'Recommendation Rejected' }).humanDecision ?? '', /rejected/);
  assert.equal(buildAIAnalysis(applyAnalysis(source, clear)).humanDecision, null);
});