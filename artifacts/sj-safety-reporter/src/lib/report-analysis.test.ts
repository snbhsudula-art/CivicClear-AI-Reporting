import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAnalysis, CHECK_FIELDS, clarificationQuestions, departmentDisplay, getReportReadiness,
  recordClarification, routingHeld, saveHumanDraftEdits, residentStatusLabel, type Report, type ReportAnalysis,
} from './report-analysis.ts';

const report: Report = {
  id: 'TEST', submittedAt: '2026-10-01T10:00:00Z', residentName: 'Demo',
  description: 'The sidewalk is blocked. The same sidewalk is clear.',
  location: '100 First Street', issueType: 'Trash / debris', urgency: 'Low',
  sourceObservedAt: '2026-10-01', sourceDanger: 'Not dangerous', requestedDepartment: 'Public Works',
  status: 'Human Review', issue: 'Sidewalk debris', summaryLocation: '100 First Street',
  structuredIssueType: 'Trash / debris', structuredUrgency: 'Low',
  structuredDescription: 'Sidewalk debris', previousCityAction: 'Unknown',
  missingInformation: [], suggestedDepartment: 'Public Works', humanEdits: '', reviewNote: '',
};
const analysis: ReportAnalysis = {
  analysisVersion: 1, assessments: CHECK_FIELDS.map(field => ({
    field, state: 'consistent', evidence: [], explanation: 'Clear resident information.', question: '',
  })),
  draft: { issue: 'Sidewalk debris', location: '100 First Street', issueType: 'Trash / debris', urgency: 'Low',
    description: 'Sidewalk debris', observedAt: '2026-10-01', department: 'Public Works', danger: 'Not dangerous' },
  missingInformation: [], routingBlocked: false,
};

test('possible hazards retain elevated AI urgency and missing-address questions through persistence and human review', () => {
  const hazardAnalysis: ReportAnalysis = {
    ...analysis,
    safetyConcern: {
      possibleHazard: true, recommendedUrgency: 'High',
      evidence: ['A container is leaking with a strong chemical smell.'],
      explanation: 'The reported leak and smell indicate a possible, unconfirmed chemical safety concern.',
    },
    assessments: analysis.assessments.map(a => a.field === 'location'
      ? { ...a, state: 'missing', question: 'What is the exact address or cross street?' }
      : a.field === 'danger' || a.field === 'urgency'
        ? { ...a, state: 'uncertain', question: `Verify ${a.field} given the possible chemical leak.` }
        : a),
    draft: { ...analysis.draft, urgency: 'High', description: 'Possible hazardous-material concern. A container is leaking with a strong chemical smell.', danger: 'Possible hazard — human review required' },
    missingInformation: ['What is the exact address or cross street?'],
    routingBlocked: true,
  };
  let checked = applyAnalysis({ ...report, description: 'A container is leaking with a strong chemical smell.', location: '', urgency: 'Low' }, hazardAnalysis);
  assert.equal(checked.urgency, 'Low');
  assert.equal(checked.structuredUrgency, 'High');
  assert.match(checked.structuredDescription, /leaking.*chemical smell/);
  assert.equal(routingHeld(checked), true);
  assert.ok(getReportReadiness(checked).score <= 49);
  assert.ok(clarificationQuestions(checked).includes('What is the exact address or cross street?'));
  checked = JSON.parse(JSON.stringify(checked)) as Report;
  assert.deepEqual(checked.analysis?.safetyConcern, hazardAnalysis.safetyConcern);
  checked = recordClarification(checked, 'location', '100 First Street', 'Resident provided a cross street.');
  checked = recordClarification(checked, 'danger', 'Possible chemical leak; substance not identified', 'Reviewer verified the reported leak, not the substance identity.');
  checked = recordClarification(checked, 'urgency', 'High', 'Reported ongoing leak warrants prioritized human review.');
  assert.equal(routingHeld(checked), false);
  assert.equal(checked.status, 'Human Review');
  assert.equal(checked.analysis?.safetyConcern?.possibleHazard, true);
  assert.match(checked.structuredDescription, /leaking.*chemical smell/);
});

test('resident In Progress is display-only and leaves the stored status and gates intact', () => {
  const checked = applyAnalysis(report, analysis);
  assert.equal(checked.status, 'AI Structured');
  const snapshot = JSON.stringify(checked);
  assert.equal(residentStatusLabel(checked.status), 'In Progress');
  assert.equal(JSON.stringify(checked), snapshot);
  assert.equal(routingHeld(checked), false);
  assert.equal(getReportReadiness(checked).score, 100);
  assert.equal(residentStatusLabel('More Information Requested'), 'More Information Needed');
});

test('legacy drafts cannot get high readiness or be treated as cleared for routing', () => {
  assert.equal(routingHeld(report), true);
  assert.equal(getReportReadiness(report).score, 0);
  assert.match(departmentDisplay(report), /held/);
});
test('every critical unresolved or missing field independently holds routing and caps score', () => {
  for (const field of CHECK_FIELDS) for (const state of ['uncertain','missing'] as const) {
    const result = applyAnalysis(report, { ...analysis, routingBlocked: true, assessments: analysis.assessments.map(a => a.field === field ? { ...a, state, question: `Clarify ${field}` } : a) });
    assert.equal(routingHeld(result), true, field);
    assert.ok(getReportReadiness(result).score <= 49, field);
    assert.deepEqual(clarificationQuestions(result), [`Clarify ${field}`]);
  }
});
test('editing draft values alone cannot resolve an AI conflict', () => {
  const checked = applyAnalysis(report, { ...analysis, assessments: analysis.assessments.map(a => ({ ...a, state: 'uncertain', question: `Clarify ${a.field}` })) });
  assert.equal(routingHeld({ ...checked, issue: 'Edited by a human', summaryLocation: 'New address', suggestedDepartment: 'Police' }), true);
});
test('clarification requires a clear value and evidence; the AI findings and sources stay unchanged', () => {
  const checked = applyAnalysis(report, { ...analysis, routingBlocked: true, assessments: analysis.assessments.map(a => a.field === 'issue' ? { ...a, state: 'uncertain', evidence: ['blocked','clear'], question: 'Blocked or clear?' } : a) });
  assert.equal(recordClarification(checked, 'issue', 'Not sure', 'Resident response'), checked);
  assert.equal(recordClarification(checked, 'issue', 'Blocked', ''), checked);
  const clarified = recordClarification(checked, 'issue', 'Blocked sidewalk', 'Resident confirmed it is blocked.');
  assert.equal(routingHeld(clarified), false);
  assert.equal(clarified.status, 'Human Review');
  assert.equal(clarified.description, report.description);
  assert.equal(clarified.location, report.location);
  assert.equal(clarified.sourceDanger, report.sourceDanger);
  assert.deepEqual(clarified.analysis, checked.analysis);
  assert.equal(clarified.resolutions?.issue?.value, 'Blocked sidewalk');
  assert.deepEqual(clarificationQuestions(clarified), []);
});
test('all six conflicts must be clarified and reload retains evidence, not just a status flag', () => {
  let checked = applyAnalysis(report, { ...analysis, routingBlocked: true, assessments: analysis.assessments.map(a => ({ ...a, state: 'uncertain', question: `Clarify ${a.field}` })) });
  for (const [i,field] of CHECK_FIELDS.entries()) {
    checked = recordClarification(checked, field, `Verified ${field}`, `Resident confirmed ${field}.`);
    assert.equal(routingHeld(checked), i !== CHECK_FIELDS.length - 1);
  }
  const restored = JSON.parse(JSON.stringify(checked)) as Report;
  assert.equal(routingHeld(restored), false);
  assert.equal(getReportReadiness(restored).score, 100);
  assert.equal(restored.status, 'Human Review');
  assert.equal(restored.description, report.description);
});
test('material edits to consistent or human-verified fields invalidate approval and rehold routing', () => {
  const approved = { ...applyAnalysis(report, analysis), status: 'Human Approved' as const };
  for (const [key,value] of [
    ['summaryLocation','999 Different Street'], ['structuredUrgency','High'],
    ['issue','A different issue'], ['structuredDescription','An opposite summary'],
    ['suggestedDepartment','Police'], ['structuredIssueType','Fire'],
    ['observedAt','2026-09-20'], ['danger','Dangerous'],
  ] as const) {
    const edited = saveHumanDraftEdits(approved, { ...approved, [key]: value });
    assert.equal(edited.status, 'Human Review', key);
    assert.equal(routingHeld(edited), true, key);
    assert.ok(getReportReadiness(edited).score <= 49, key);
    assert.match(departmentDisplay(edited), /held/, key);
    assert.equal(edited.description, approved.description);
    assert.equal(routingHeld(JSON.parse(JSON.stringify(edited))), true, key);
  }
  assert.equal(saveHumanDraftEdits(approved, approved), approved);
});
test('renewed clarification retains prior human evidence and verifies the new value without auto approval', () => {
  let checked = applyAnalysis(report, { ...analysis, routingBlocked: true, assessments: analysis.assessments.map(a => a.field === 'location' ? { ...a, state: 'uncertain', question: 'Which address?' } : a) });
  checked = recordClarification(checked, 'location', '100 First Street', 'First verified address.');
  const edited = saveHumanDraftEdits(checked, { ...checked, summaryLocation: '999 Different Street' });
  assert.equal(routingHeld(edited), true);
  assert.equal(edited.resolutions?.location?.value, '100 First Street');
  const renewed = recordClarification(edited, 'location', '999 Different Street', 'Resident corrected the address.');
  assert.equal(routingHeld(renewed), false);
  assert.equal(renewed.status, 'Human Review');
  assert.equal(renewed.resolutionHistory?.[0]?.value, '100 First Street');
  assert.equal(renewed.summaryLocation, '999 Different Street');
  assert.equal(renewed.location, '100 First Street');
});
test('department edits while another field is held cannot survive without fresh verification', () => {
  const checked = applyAnalysis(report, { ...analysis, routingBlocked: true, assessments: analysis.assessments.map(a => a.field === 'danger' ? { ...a, state: 'uncertain', question: 'Dangerous?' } : a) });
  const edited = saveHumanDraftEdits(checked, { ...checked, suggestedDepartment: 'Housing' });
  const safetyResolved = recordClarification(edited, 'danger', 'Not dangerous', 'Resident clarified.');
  assert.equal(routingHeld(safetyResolved), true);
  assert.match(departmentDisplay(safetyResolved), /held/);
  const departmentResolved = recordClarification(safetyResolved, 'department', 'Public Works', 'Reviewer checked service responsibility.');
  assert.equal(routingHeld(departmentResolved), false);
  assert.equal(departmentDisplay(departmentResolved), 'Public Works');
});