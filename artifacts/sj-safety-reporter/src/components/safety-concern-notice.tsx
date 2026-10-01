import { AlertTriangle } from 'lucide-react';
import { isClear, type Report } from '@/lib/report-analysis';

export function SafetyConcernNotice({ report }: { report: Report }) {
  const concern = report.analysis?.safetyConcern;
  if (!concern?.possibleHazard) return null;
  const reviewed = isClear(report.resolutions?.danger?.value) &&
    Boolean(report.resolutions?.danger?.note.trim()) && !report.pendingDraftReview?.danger;

  return <section className="mb-5 rounded-xl border-2 border-red-300 bg-red-50 p-5 text-red-950" aria-label="Possible hazardous-material concern" data-testid="safety-concern-notice">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-1 shrink-0" size={23} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide">{reviewed ? 'Human safety review recorded · original AI flag retained' : 'Prioritize human safety review'}</p>
        <h2 className="mt-2 text-lg font-bold leading-6">Possible hazardous-material / chemical safety concern</h2>
        <p className="mt-3 font-bold" data-testid="text-hazard-urgency">AI-recommended urgency: {concern.recommendedUrgency}</p>
        <p className="mt-1 text-sm">Resident-selected urgency: {report.urgency || 'Not supplied'} · Current draft urgency: {report.structuredUrgency}</p>
        <p className="mt-3 text-sm leading-6">These are resident-reported indicators, not confirmation that a substance is hazardous. Missing location or other details do not hide this potential safety concern. A human reviewer is responsible for verification, urgency, and the final decision.</p>
        <p className="mt-3 text-sm leading-6" data-testid="text-hazard-explanation">{concern.explanation}</p>
        <p className="mt-4 text-xs font-bold">Preserved safety indicators</p>
        <ul className="mt-2 space-y-2">{concern.evidence.map((quote, index) =>
          <li key={index} className="whitespace-pre-wrap break-words rounded-lg border border-red-200 bg-white/70 p-3 text-sm leading-6">“{quote}”</li>,
        )}</ul>
      </div>
    </div>
  </section>;
}