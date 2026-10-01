export const CHECK_FIELDS = ['urgency', 'location', 'date', 'issue', 'department', 'danger'] as const;
export type CheckField = typeof CHECK_FIELDS[number];
export type Status = 'Awaiting City Review' | 'AI Structured' | 'Human Review' | 'More Information Requested' | 'Human Approved' | 'Recommendation Rejected';
export function residentStatusLabel(status: Status): string {
  const labels: Record<Status, string> = {
    'Awaiting City Review': 'Awaiting demo review',
    'AI Structured': 'In Progress',
    'Human Review': 'Under Review',
    'More Information Requested': 'More Information Needed',
    'Human Approved': 'Approved by a Reviewer',
    'Recommendation Rejected': 'Recommendation Not Approved',
  };
  return labels[status];
}
export type Assessment = {
  field: CheckField;
  state: 'consistent' | 'uncertain' | 'missing';
  evidence: string[];
  explanation: string;
  question: string;
};
export type ReportAnalysis = {
  analysisVersion: number;
  // Optional for older browser-saved analyses that predate hazard extraction.
  safetyConcern?: {
    possibleHazard: boolean;
    recommendedUrgency: 'None' | 'Medium' | 'High';
    evidence: string[];
    explanation: string;
  };
  assessments: Assessment[];
  draft: { issue: string; location: string; issueType: string; urgency: string; description: string; observedAt: string; department: string; danger: string };
  missingInformation: string[];
  routingBlocked: boolean;
};
export type Resolution = { value: string; note: string; reviewer: string; resolvedAt: string };
export type Report = {
  id: string; submittedAt: string; residentName: string; description: string; location: string;
  issueType: string; urgency: string; status: Status; issue: string; summaryLocation: string;
  structuredIssueType: string; structuredUrgency: string; structuredDescription: string;
  previousCityAction: string; missingInformation: string[]; suggestedDepartment: string;
  humanEdits: string; reviewNote: string;
  observedAt?: string; danger?: string; requestedDepartment?: string;
  // Original resident inputs and AI findings are retained, even after human clarification.
  sourceObservedAt?: string; sourceDanger?: string;
  analysis?: ReportAnalysis;
  resolutions?: Partial<Record<CheckField, Resolution>>;
  pendingDraftReview?: Partial<Record<CheckField, { previous: string[]; proposed: string[] }>>;
  resolutionHistory?: Array<Resolution & { field: CheckField }>;
};
export const FIELD_LABELS: Record<CheckField, string> = {
  urgency: 'Urgency', location: 'Location', date: 'Date / time observed',
  issue: 'Issue description', department: 'Department', danger: 'Danger / safety',
};

export function isClear(value: string | undefined) {
  return Boolean(value?.trim() && !/^(unknown|not sure|missing|uncertain|routing held)(?:\b|$)/i.test(value.trim()));
}
export function effectiveAssessments(report: Report) {
  return report.analysis?.assessments.map(a => report.pendingDraftReview?.[a.field] ? {
    ...a, state: 'uncertain' as const,
    explanation: `${a.explanation} The draft was materially edited after this check. Earlier verification no longer covers the changed values.`,
    question: `Please verify the edited ${FIELD_LABELS[a.field].toLowerCase()} and record fresh evidence before routing.`,
  } : a) ?? [];
}
export function unresolvedAssessments(report: Report) {
  return effectiveAssessments(report).filter(a =>
    report.pendingDraftReview?.[a.field] ||
    a.state !== 'consistent' && !(isClear(report.resolutions?.[a.field]?.value) && report.resolutions?.[a.field]?.note.trim()),
  );
}
export function routingHeld(report: Report) {
  return !report.analysis || CHECK_FIELDS.some(field => !report.analysis?.assessments.some(a => a.field === field)) || unresolvedAssessments(report).length > 0;
}
export function departmentDisplay(report: Report) {
  return routingHeld(report) ? 'Routing held — clarification / review required' : report.suggestedDepartment;
}
export function clarificationQuestions(report: Report) {
  if (!report.analysis) return ['Run the AI contradiction check before routing or approval.'];
  const allQuestions = report.analysis.assessments.filter(a => a.state !== 'consistent').map(a => a.question);
  allQuestions.push(...effectiveAssessments(report).filter(a => a.state !== 'consistent').map(a => a.question));
  return [
    ...unresolvedAssessments(report).map(a => a.question || `Please clarify ${FIELD_LABELS[a.field].toLowerCase()}.`),
    ...report.missingInformation.filter(q => !allQuestions.includes(q)),
  ];
}
export function applyAnalysis(report: Report, analysis: ReportAnalysis): Report {
  return {
    ...report, analysis, resolutions: {}, pendingDraftReview: {}, resolutionHistory: [],
    status: analysis.routingBlocked ? 'More Information Requested' : 'AI Structured',
    issue: analysis.draft.issue, summaryLocation: analysis.draft.location,
    structuredIssueType: analysis.draft.issueType, structuredUrgency: analysis.draft.urgency,
    structuredDescription: analysis.draft.description, observedAt: analysis.draft.observedAt,
    danger: analysis.draft.danger, suggestedDepartment: analysis.draft.department,
    missingInformation: analysis.missingInformation, humanEdits: '', reviewNote: '',
  };
}
export function recordClarification(report: Report, field: CheckField, value: string, note: string): Report {
  if (!effectiveAssessments(report).some(a => a.field === field && a.state !== 'consistent') || !isClear(value) || !note.trim()) return report;
  const pendingDraftReview = { ...report.pendingDraftReview };
  delete pendingDraftReview[field];
  const previousResolution = report.resolutions?.[field];
  const next: Report = {
    ...report,
    pendingDraftReview,
    resolutionHistory: [...(report.resolutionHistory ?? []), ...(previousResolution ? [{ ...previousResolution, field }] : [])],
    resolutions: { ...report.resolutions, [field]: { value: value.trim(), note: note.trim(), reviewer: 'Robert (demo human reviewer)', resolvedAt: new Date().toISOString() } },
    humanEdits: 'Clarification recorded by Robert',
    status: 'Human Review',
  };
  if (field === 'urgency') next.structuredUrgency = value.trim();
  if (field === 'location') next.summaryLocation = value.trim();
  if (field === 'date') next.observedAt = value.trim();
  if (field === 'issue') {
    next.issue = value.trim();
    next.structuredDescription = value.trim();
    next.structuredIssueType = 'Human clarified issue — see description';
  }
  if (field === 'department') next.suggestedDepartment = value.trim();
  if (field === 'danger') next.danger = value.trim();
  // A held department is not a routing choice. Recover only an explicitly consistent
  // resident-provided department once every other critical question is answered.
  if (!routingHeld(next) && !isClear(next.suggestedDepartment)) {
    const department = next.analysis?.assessments.find(a => a.field === 'department');
    next.suggestedDepartment = next.resolutions?.department?.value || next.requestedDepartment || department?.evidence.join(' / ') || 'Human department selection required';
  }
  next.missingInformation = clarificationQuestions(next);
  return next;
}
const EDITED_FIELD_GROUPS: Record<CheckField, Array<keyof Report>> = {
  issue: ['issue', 'structuredIssueType', 'structuredDescription'], location: ['summaryLocation'],
  urgency: ['structuredUrgency'], date: ['observedAt'], department: ['suggestedDepartment'], danger: ['danger'],
};
export function saveHumanDraftEdits(original: Report, draft: Report): Report {
  const next = { ...original, pendingDraftReview: { ...original.pendingDraftReview } };
  let changed = false;
  for (const field of CHECK_FIELDS) {
    const keys = EDITED_FIELD_GROUPS[field];
    const before = keys.map(key => String(original[key] ?? '').trim());
    const after = keys.map(key => String(draft[key] ?? '').trim());
    if (before.every((value,i) => value === after[i])) continue;
    changed = true;
    next.pendingDraftReview[field] = { previous: original.pendingDraftReview?.[field]?.previous ?? before, proposed: after };
    for (const key of keys) Object.assign(next, { [key]: draft[key] });
  }
  if (!changed) return original;
  next.status = 'Human Review';
  next.humanEdits = 'Edited by Robert — renewed verification required';
  return next;
}
export function getReportReadiness(report: Report) {
  const clear = (field: CheckField) => !report.pendingDraftReview?.[field] && Boolean(report.analysis?.assessments.some(a => a.field === field && a.state === 'consistent') || isClear(report.resolutions?.[field]?.value));
  const rawScore = (clear('issue') ? 20 : 0) + (clear('location') ? 20 : 0) +
    (clear('urgency') ? 15 : 0) + (clear('date') ? 10 : 0) +
    (clear('danger') ? 15 : 0) + (clear('department') ? 10 : 0) +
    (isClear(report.structuredDescription) && clear('issue') ? 10 : 0);
  return {
    score: routingHeld(report) ? Math.min(49, rawScore) : rawScore,
    held: routingHeld(report),
    found: CHECK_FIELDS.map(field => ({ label: `${FIELD_LABELS[field]} clarified`, complete: clear(field) })),
    missing: clarificationQuestions(report),
  };
}