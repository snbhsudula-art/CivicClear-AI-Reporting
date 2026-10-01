import { useState } from 'react';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { effectiveAssessments, FIELD_LABELS, isClear, routingHeld, unresolvedAssessments, type CheckField, type Report } from '@/lib/report-analysis';

type Props = {
  report: Report;
  onResolve?: (field: CheckField, value: string, note: string) => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  error?: string;
};
export function ContradictionCheck({ report, onResolve, onAnalyze, analyzing, error }: Props) {
  const held = routingHeld(report);
  const unresolved = unresolvedAssessments(report);
  return <section className="card my-6 overflow-hidden" data-testid="contradiction-check" aria-label="Contradiction check">
    <div className={`border-b px-5 py-5 ${held ? 'bg-amber-50' : 'bg-blue-50'}`}>
      <div className="flex items-center gap-2 text-[#194784]"><ShieldCheck size={20} /><h2 className="text-lg font-bold">Contradiction &amp; clarification check</h2></div>
      <p className="mt-2 text-sm leading-6 text-slate-700" data-testid="text-routing-state">
        {held ? 'Routing held. Clarify unresolved information before choosing a department or approving this report.' : 'Critical details are clarified. A human reviewer still makes the final decision; nothing is automatically routed.'}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">AI checks urgency, location, date, issue description, department, and danger before drafting. It can miss conflicts; review the original information.</p>
    </div>
    {!report.analysis ? <div className="p-5"><p className="text-sm text-slate-700">This existing report has not been checked with the new AI analysis. It is not ready for routing.</p>
      {onAnalyze && <><p className="mt-3 text-xs leading-5 text-slate-600">Checking sends report text and report fields to OpenAI through Replit. The separate name field and photo are not sent. Avoid personal details in the narrative.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={onAnalyze} disabled={analyzing} data-testid="button-analyze-existing">{analyzing ? 'Checking contradictions…' : 'Check this report with AI'}</button></>}
    </div> : <div className="divide-y divide-slate-200">
      {effectiveAssessments(report).map(assessment => {
        const resolution = report.resolutions?.[assessment.field];
        const pending = unresolved.some(a => a.field === assessment.field);
        return <article key={assessment.field} className="p-5" data-testid={`assessment-${assessment.field}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800">{FIELD_LABELS[assessment.field]}</h3>
            <span className={`badge ${pending ? 'bg-amber-100 text-amber-950' : 'bg-blue-100 text-blue-900'}`} data-testid={`assessment-state-${assessment.field}`}>
              {pending ? <AlertTriangle size={13} /> : <Check size={13} />}
              {pending ? assessment.state === 'uncertain' ? 'Uncertain — clarification required' : 'Missing — clarification required' : resolution ? 'Human clarification recorded' : 'No conflict detected'}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{assessment.explanation}</p>
          {report.pendingDraftReview?.[assessment.field] && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Draft change needs fresh human verification</p>
            <p>Previously checked: {report.pendingDraftReview[assessment.field]?.previous.join(' · ')}</p>
            <p>Proposed edit: {report.pendingDraftReview[assessment.field]?.proposed.join(' · ')}</p>
          </div>}
          {assessment.evidence.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-slate-600">Preserved resident statements</p>
            <ul className="mt-2 space-y-2">{assessment.evidence.map((quote, i) => <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 break-words">“{quote}”</li>)}</ul></div>}
          {assessment.state !== 'consistent' && <p className="mt-3 text-sm font-semibold text-amber-950">{assessment.question}</p>}
          {resolution && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6">
            <p className="font-semibold text-blue-950">{report.pendingDraftReview?.[assessment.field] ? 'Previous clarification (does not verify the edit)' : 'Human clarification'}: {resolution.value}</p>
            <p className="text-slate-700">Evidence / response: {resolution.note}</p>
            <p className="mt-1 text-xs text-slate-600">{resolution.reviewer} · {new Date(resolution.resolvedAt).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-600">Original conflicting statements remain preserved above.</p>
          </div>}
          {report.resolutionHistory?.filter(item => item.field === assessment.field).map((item,i) => <p key={i} className="mt-2 text-xs leading-5 text-slate-600">Earlier human clarification retained: {item.value} · {item.note} · {item.reviewer} · {new Date(item.resolvedAt).toLocaleString()}</p>)}
          {pending && onResolve && <ResolutionForm field={assessment.field} onResolve={onResolve} />}
        </article>;
      })}
    </div>}
    {error && <p className="m-5 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert" data-testid="text-analysis-error">{error}</p>}
    <p className="border-t p-5 text-xs leading-5 text-slate-600">A clarification request is not a human decision. Only a human reviewer can approve or reject the recommendation. This class prototype does not contact residents or route reports to a real agency.</p>
  </section>;
}

function ResolutionForm({ field, onResolve }: { field: CheckField; onResolve: NonNullable<Props['onResolve']> }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const enabled = confirmed && isClear(value) && Boolean(note.trim());
  return <form className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={e => { e.preventDefault(); if (enabled) onResolve(field, value, note); }}>
    <div><label htmlFor={`clarification-${field}`} className="field-label">Clarified {FIELD_LABELS[field].toLowerCase()}</label>
      <input id={`clarification-${field}`} className="field-input" maxLength={1000} value={value} onChange={e => setValue(e.target.value)} data-testid={`input-clarification-${field}`} required /></div>
    <div><label htmlFor={`clarification-note-${field}`} className="field-label">Resident response or verified evidence</label>
      <textarea id={`clarification-note-${field}`} className="field-input" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} data-testid={`input-clarification-note-${field}`} required /></div>
    <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" data-testid={`checkbox-clarification-${field}`} />I obtained clarification or verified evidence; I am not guessing between the conflicting versions.</label>
    <button type="submit" disabled={!enabled} className="btn btn-primary" data-testid={`button-save-clarification-${field}`}>Record human clarification</button>
  </form>;
}