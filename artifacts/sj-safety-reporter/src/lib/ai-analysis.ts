import {
  CHECK_FIELDS, FIELD_LABELS, clarificationQuestions, effectiveAssessments,
  isClear, routingHeld, unresolvedAssessments, type Assessment, type CheckField, type Report,
} from './report-analysis.ts';

export type AnalysisFlag = {
  field: string; status: string; explanation: string; evidence: string[]; question: string;
};
export type AnalysisFinding = {
  key: string; label: string; value: string; status: string; explanation: string; sourceValue?: string;
};

// This is a read-only presentation of the saved check, not a new AI decision.
// Evidence must still be literal resident input, never edited or generated text.
export function buildAIAnalysis(report: Report) {
  const available = Boolean(report.analysis);
  const held = routingHeld(report);
  const assessments = effectiveAssessments(report);
  const unresolved = new Set(unresolvedAssessments(report).map(a => a.field));
  const sources = [
    report.description, report.location, report.issueType, report.urgency,
    report.sourceObservedAt, report.sourceDanger, report.requestedDepartment,
  ].filter((value): value is string => Boolean(value?.trim()));
  const literalEvidence = (quotes: string[]) => [...new Set(quotes.filter(
    quote => Boolean(quote.trim()) && sources.some(source => source.includes(quote)),
  ))];
  const statusFor = (field: CheckField): string => {
    const assessment = assessments.find(a => a.field === field);
    if (!assessment) return 'Human Review Required';
    if (report.pendingDraftReview?.[field]) return 'Needs Clarification';
    if (unresolved.has(field)) return assessment.state === 'missing' ? 'Needs Clarification' : 'Uncertain';
    if (report.resolutions?.[field]) return 'Human Review Recorded';
    return 'Detected';
  };
  const flagFor = (assessment: Assessment): AnalysisFlag => {
    const edit = report.pendingDraftReview?.[assessment.field];
    const changedValues = edit
      ? ` Previous draft: “${edit.previous.join(' / ')}”. Edited draft: “${edit.proposed.join(' / ')}”. These are draft versions, not new resident statements.`
      : '';
    return {
      field: FIELD_LABELS[assessment.field],
      status: statusFor(assessment.field),
      explanation: assessment.explanation + changedValues,
      evidence: literalEvidence(assessment.evidence),
      question: unresolved.has(assessment.field) ? assessment.question : '',
    };
  };
  const concern = report.analysis?.safetyConcern;
  const hazardReviewed = Boolean(
    isClear(report.resolutions?.danger?.value) && report.resolutions?.danger?.note.trim() &&
    !report.pendingDraftReview?.danger,
  );
  const hazard = {
    possible: concern?.possibleHazard ?? false,
    urgency: concern?.recommendedUrgency ?? 'None',
    explanation: concern?.explanation || 'No hazardous-material assessment was recorded. This does not establish that the situation is safe.',
    evidence: literalEvidence(concern?.evidence ?? []),
    reviewed: hazardReviewed,
  };
  const originalFlags = assessments.filter(a => a.state !== 'consistent');
  const flags: AnalysisFlag[] = originalFlags.map(flagFor);
  if (hazard.possible) flags.unshift({
    field: 'Possible hazardous-material / chemical safety concern',
    status: hazardReviewed ? 'Human Review Recorded' : 'Human Review Required',
    explanation: hazard.explanation,
    evidence: hazard.evidence,
    question: '',
  });
  const contradictions = assessments.filter(a => a.state === 'uncertain').map(flagFor);
  const evidenceMap = new Map<string, Set<string>>();
  const addEvidence = (quote: string, field: string) => {
    const labels = evidenceMap.get(quote) ?? new Set<string>();
    labels.add(field); evidenceMap.set(quote, labels);
  };
  for (const assessment of assessments) {
    for (const quote of literalEvidence(assessment.evidence)) addEvidence(quote, FIELD_LABELS[assessment.field]);
  }
  for (const quote of hazard.evidence) addEvidence(quote, 'Safety indicators');
  const missingInformation = [...new Set(clarificationQuestions(report).filter(q => q.trim()))];
  const explain = (field: CheckField) =>
    assessments.find(a => a.field === field)?.explanation ||
    'No AI assessment is available for this field. A human must review the resident’s source report.';
  const value = (text: string | undefined) => text?.trim() || 'Not supplied';
  const candidate = available && isClear(report.suggestedDepartment)
    ? report.suggestedDepartment : 'No department suggested — human selection required';
  const routing = {
    candidate,
    requested: value(report.requestedDepartment),
    status: held ? 'Needs Clarification' : 'Human Review Required',
    explanation: available
      ? `${explain('department')} ${held ? 'Routing is held until critical details are clarified.' : 'A clear check is not authorization to route.'} Any resident-requested department is a claim to review, not an authoritative instruction. A human confirms the appropriate department and final decision.`
      : 'Run the AI check before considering a department. The resident’s requested department is not an authoritative routing instruction.',
  };
  const findings: AnalysisFinding[] = [
    {
      key: 'safety', label: 'Safety indicators',
      value: hazard.possible
        ? 'Possible hazardous-material / chemical concern — not confirmed'
        : available ? value(report.danger) : 'Not assessed',
      status: hazard.possible ? hazardReviewed ? 'Human Review Recorded' : 'Human Review Required' : statusFor('danger'),
      explanation: hazard.possible ? hazard.explanation : `${explain('danger')} A missing hazardous-material flag is not proof of safety.`,
      sourceValue: value(report.sourceDanger),
    },
    {
      key: 'location', label: 'Location', value: value(report.summaryLocation),
      status: statusFor('location'), explanation: explain('location'), sourceValue: value(report.location),
    },
    {
      key: 'urgency', label: 'Urgency', value: value(report.structuredUrgency),
      status: statusFor('urgency'),
      explanation: `${explain('urgency')}${hazard.possible ? ` Original AI safety recommendation: ${hazard.urgency}. Reported safety indicators are reviewed independently of the resident’s selected urgency.` : ''}`,
      sourceValue: value(report.urgency),
    },
    {
      key: 'issue', label: 'Issue type', value: value(report.structuredIssueType),
      status: statusFor('issue'), explanation: explain('issue'), sourceValue: value(report.issueType),
    },
    {
      key: 'missing', label: 'Missing information',
      value: !available ? 'AI check not completed' : missingInformation.length ? `${missingInformation.length} outstanding clarification item${missingInformation.length === 1 ? '' : 's'}` : 'No outstanding clarification questions',
      status: !available || missingInformation.length ? 'Needs Clarification' : 'Human Review Required',
      explanation: 'Completeness is tracked by Report Readiness, not AI confidence. Clarifications require human evidence; a complete report still needs a human decision.',
    },
    {
      key: 'department', label: 'Suggested department', value: candidate,
      status: routing.status, explanation: routing.explanation, sourceValue: routing.requested,
    },
  ];
  const humanDecision = report.status === 'Human Approved'
    ? 'A demo human reviewer approved this recommendation. This is not a City decision or proof of reported conditions.'
    : report.status === 'Recommendation Rejected'
      ? 'A demo human reviewer rejected this recommendation. Original AI findings and resident evidence remain preserved.'
      : null;
  const overall = !available
    ? 'AI analysis is not yet available for this report. Run the existing contradiction check; no routing or approval is authorized.'
    : `${hazard.possible ? 'The saved AI check flagged a possible hazardous-material / chemical safety concern, not a confirmed hazard. ' : 'The saved AI check organized the resident’s reported issue and assessed critical details. '}${held ? 'Unresolved or edited critical details need clarification; routing remains held.' : 'No critical fields are currently unresolved; the findings remain drafts for human review.'} ${humanDecision || 'A human reviewer must verify the information and make the final decision.'}`;
  return {
    available, held, overall, flags, findings,
    evidence: [...evidenceMap].map(([quote, fields]) => ({ quote, fields: [...fields] })),
    interpretation: CHECK_FIELDS.map(field => ({
      field: FIELD_LABELS[field], explanation: explain(field), status: statusFor(field),
    })),
    contradictions, missingInformation, routing, hazard, humanDecision,
  };
}