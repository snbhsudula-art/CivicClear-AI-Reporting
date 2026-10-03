import { applyAnalysis, routingHeld, type Report, type ReportAnalysis } from './report-analysis.ts';

export const RESIDENT_STEPS = [
  'What happened?', 'Where did you notice it?', 'How urgent is it?', 'Review your report', 'Submit',
] as const;

export type ResidentFormState = {
  residentName: string; description: string; location: string; issueType: string;
  urgency: string; observedAt: string; requestedDepartment: string; danger: string;
};

export function residentAnalysisInput(form: ResidentFormState) {
  const { residentName: _excludedName, ...input } = form;
  return input;
}

export function validateResidentStep(step: number, form: ResidentFormState) {
  if ((step === 0 || step === 3 || step === 4) && !form.description.trim()) {
    return 'Please describe what happened before continuing.';
  }
  // Location, date, and safety details may be unknown. The existing AI and
  // human clarification workflow must handle missing information, not this form.
  return '';
}

export function createResidentReport(
  sample: Report, form: ResidentFormState, result: ReportAnalysis, id: string, submittedAt: string,
) {
  return applyAnalysis({
    ...sample, ...form, id, submittedAt,
    sourceObservedAt: form.observedAt, sourceDanger: form.danger,
    analysis: undefined, resolutions: {}, pendingDraftReview: {}, resolutionHistory: [],
  }, result);
}

// The class demo's seeded inbox example is not a resident submission.
// Existing real browser records are retained; there is no account ownership.
export function latestResidentReport(reports: Report[], sampleId: string) {
  return reports.find(report => report.id !== sampleId) ?? null;
}

export function residentNextStepMessage(report: Report) {
  const heldNote = routingHeld(report) ? ' Unresolved details still hold routing.' : '';
  if (report.status === 'Human Approved') {
    return `A demo human reviewer approved the recommendation. This is a simulated decision, not a City action.${heldNote}`;
  }
  if (report.status === 'Recommendation Rejected') {
    return `A demo human reviewer did not approve the recommendation. Your original report and review history remain preserved.${heldNote}`;
  }
  if (!report.analysis) {
    return 'Your report is saved. A reviewer must run the details check before any routing or approval.';
  }
  if (routingHeld(report)) {
    return 'A human reviewer needs to check the unclear details below before deciding. Routing remains held.';
  }
  return 'Your report is waiting for a human reviewer to check the details and record a simulated decision.';
}

export function getResidentProgress(report: Report) {
  const decided = report.status === 'Human Approved' || report.status === 'Recommendation Rejected';
  const analyzed = Boolean(report.analysis);
  const current = analyzed ? 2 : 1;
  return ['Report Submitted', 'In Progress', 'Human Review', 'Decision'].map((label, index) => ({
    label,
    state: index === 0 || analyzed && index === 1 || decided && index >= 2
      ? 'complete' as const
      : decided ? 'not-performed' as const
        : index === current ? 'current' as const : 'upcoming' as const,
  }));
}