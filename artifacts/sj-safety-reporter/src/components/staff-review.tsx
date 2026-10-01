import { useEffect, useState, type ReactNode } from 'react';
import { useAnalyzeCivicReport } from '@workspace/api-client-react';
import { Check, CircleHelp, Pencil, X } from 'lucide-react';
import { ContradictionCheck } from './contradiction-check';
import {
  applyAnalysis, clarificationQuestions, departmentDisplay, isClear, recordClarification, routingHeld, saveHumanDraftEdits,
  type CheckField, type Report, type Status,
} from '@/lib/report-analysis';

type Props = {
  load: () => Report[]; storageKey: string;
  timeline: (report: Report) => ReactNode;
  readiness: (report: Report) => ReactNode;
};
export function StaffReview({ load, storageKey, timeline, readiness }: Props) {
  const [reports, setReports] = useState(load);
  const [selectedId, setSelectedId] = useState(reports[0]?.id);
  const [editing, setEditing] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const selected = reports.find(r => r.id === selectedId) ?? reports[0];
  const [draft, setDraft] = useState(selected);
  const [error, setError] = useState('');
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const analysis = useAnalyzeCivicReport();
  useEffect(() => { setDraft(selected); setEditing(false); setError(''); }, [selected]);
  const persist = (next: Report[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setReports(next); return true; }
    catch { setError('Changes could not be saved in this browser. No changes were applied.'); return false; }
  };
  const replace = (report: Report) => persist(reports.map(r => r.id === report.id ? report : r));
  const updateStatus = (status: Status) => {
    if (!selected) return;
    if (status === 'Human Approved' && (routingHeld(selected) || editing)) {
      setError('Clarify every critical field and save your edits before approval.'); return;
    }
    replace({ ...selected, status }); setEditing(false);
  };
  const resolve = (field: CheckField, value: string, note: string) => {
    if (!selected || checkingId) return;
    replace(recordClarification(selected, field, value, note));
  };
  const analyzeExisting = async () => {
    if (!selected || checkingId) return;
    const original = selected;
    setCheckingId(original.id); setError('');
    try {
      const result = await analysis.mutateAsync({ data: {
        description: original.description, location: original.location, issueType: original.issueType,
        urgency: original.urgency, observedAt: original.sourceObservedAt ?? '',
        requestedDepartment: original.requestedDepartment ?? '', danger: original.sourceDanger ?? 'Not sure',
      } });
      replace(applyAnalysis(original, result));
    } catch {
      setError('AI analysis failed. The original report is unchanged and routing remains held. Please retry.');
    } finally { setCheckingId(null); }
  };
  const saveEdits = () => {
    if (!draft || !selected) return;
    const fields = ['issue', 'summaryLocation', 'structuredIssueType', 'structuredUrgency', 'structuredDescription', 'suggestedDepartment'] as const;
    if (fields.some(field => isClear(selected[field]) && !isClear(draft[field]))) {
      setError('A clarified field cannot be replaced with an empty or uncertain value. Cancel or supply a verified value.'); return;
    }
    replace(saveHumanDraftEdits(selected, draft)); setEditing(false);
  };
  const edit = (field: keyof Report, value: string) => setDraft(current => current ? ({ ...current, [field]: value }) : current);
  const needsReview = reports.filter(r => r.status !== 'Human Approved' && r.status !== 'Recommendation Rejected').length;
  if (!selected || !draft) return <div className="shell-width py-12"><h1 className="display text-4xl">Demo review workspace</h1><p className="mt-4">No reports saved in this browser.</p></div>;
  return <div className="page-enter shell-width py-8 md:py-12">
    <p className="eyebrow text-blue-800">Staff / reviewer workspace · Robert · demo</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-4"><h1 className="display text-4xl text-slate-900 md:text-5xl">AI-Assisted Report Review</h1><span className="badge bg-blue-100 text-blue-900">{needsReview} needs review</span></div>
    <p className="mt-3 max-w-3xl leading-7 text-slate-600">AI flags contradictions and missing details, not verified facts. Robert records clarification and makes the final simulated decision. This is not a City workflow.</p>
    <p className="my-6 rounded-lg border-l-4 border-blue-700 bg-blue-50 p-4 text-sm font-bold text-blue-950">Human review required before action. Unresolved critical information holds department routing and approval.</p>
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <section className={`${mobileList ? 'block' : 'hidden'} lg:block`} aria-label="Reports">
        <div className="card overflow-hidden"><div className="border-b px-5 py-4"><p className="eyebrow text-blue-800">Inbox</p><h2 className="mt-1 font-bold text-slate-900">Reports · {reports.length}</h2></div>
          <div className="divide-y">{reports.map(report => <button type="button" key={report.id} disabled={Boolean(checkingId)} className={`w-full border-l-4 p-5 text-left hover:bg-blue-50 ${report.id === selected.id ? 'border-blue-700 bg-blue-50' : 'border-transparent'}`} onClick={() => { setSelectedId(report.id); setMobileList(false); }} data-testid={`button-report-${report.id}`}>
            <p className="font-mono text-xs text-blue-800">{report.id}</p><p className="mt-2 text-sm font-bold text-slate-900">{report.issue}</p><p className="mt-1 text-xs text-slate-600">{report.summaryLocation}</p>
            <p className="mt-1 text-xs text-slate-600">{report.structuredIssueType} · AI urgency: {report.structuredUrgency}</p>
            <p className="mt-3"><StatusPill status={report.status} /></p><p className="mt-2 text-xs font-semibold text-slate-700">{routingHeld(report) ? 'Routing held' : 'Human decision required'}</p>
          </button>)}</div>
        </div>
      </section>
      <section className={`${mobileList ? 'hidden' : 'block'} lg:block`}>
        <button className="btn btn-ghost mb-4 lg:hidden" type="button" onClick={() => setMobileList(true)} disabled={Boolean(checkingId)} data-testid="button-show-report-list">← All reports</button>
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-blue-50 px-5 py-5 md:px-7"><div><p className="font-mono text-xs text-blue-800">{selected.id}</p><h2 className="display mt-2 text-2xl text-slate-900">{selected.issue}</h2><p className="mt-2 text-sm text-slate-600">Submitted by {selected.residentName} · {new Date(selected.submittedAt).toLocaleDateString()}</p></div><StatusPill status={selected.status} /></div>
          <div className="p-5 md:p-7">
            {timeline(selected)}
            <div className="mt-6">{readiness(selected)}</div>
            <ContradictionCheck key={selected.id} report={selected} onResolve={editing || checkingId ? undefined : resolve} onAnalyze={editing ? undefined : analyzeExisting} analyzing={checkingId === selected.id} error={error} />
            <details className="mb-7 rounded-xl border border-slate-200 p-4" data-testid="details-original-report"><summary className="cursor-pointer font-semibold text-slate-800">Original resident report (unchanged)</summary><blockquote className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.description}</blockquote><p className="mt-3 text-xs text-slate-600">Original location: {selected.location || 'Missing'} · Urgency: {selected.urgency || 'Missing'} · Issue type: {selected.issueType || 'Missing'}</p><p className="mt-2 text-xs text-slate-600">Date: {selected.sourceObservedAt || 'Not separately supplied'} · Danger: {selected.sourceDanger || 'Not separately supplied'} · Department: {selected.requestedDepartment || 'Not separately supplied'}</p></details>
            <h3 className="mb-5 font-bold text-slate-900">Draft fields · subject to human review</h3>
            {editing ? <div className="grid gap-5 md:grid-cols-2">
              <EditField label="Issue" id="issue" value={draft.issue} onChange={v => edit('issue', v)} />
              <EditField label="Location summary" id="location" value={draft.summaryLocation} onChange={v => edit('summaryLocation', v)} />
              <EditField label="Issue type" id="type" value={draft.structuredIssueType} onChange={v => edit('structuredIssueType', v)} />
              <div><label className="field-label" htmlFor="edit-urgency">Urgency</label><select id="edit-urgency" className="field-input" value={draft.structuredUrgency} onChange={e => edit('structuredUrgency', e.target.value)} data-testid="select-edit-urgency">{!['High','Medium','Low','Not sure'].includes(draft.structuredUrgency) && <option>{draft.structuredUrgency}</option>}<option>High</option><option>Medium</option><option>Low</option><option>Not sure</option></select></div>
              <EditField label="Suggested department (not routed)" id="department" value={draft.suggestedDepartment} onChange={v => edit('suggestedDepartment', v)} />
              <div className="md:col-span-2"><label className="field-label" htmlFor="edit-summary">Description / summary</label><textarea id="edit-summary" className="field-input min-h-[110px]" maxLength={12000} value={draft.structuredDescription} onChange={e => edit('structuredDescription', e.target.value)} data-testid="input-edit-summary" /></div>
              <p className="text-xs leading-5 text-slate-600 md:col-span-2">Material edits invalidate the affected field’s verification and any prior approval. Record fresh evidence in the check above before deciding.</p>
              <div className="flex gap-2 md:col-span-2"><button className="btn btn-primary" type="button" onClick={saveEdits} data-testid="button-save-edits"><Check size={16} />Save edits</button><button type="button" className="btn btn-ghost" onClick={() => { setDraft(selected); setEditing(false); }} data-testid="button-cancel-edits">Cancel</button></div>
            </div> : <div className="grid gap-5 md:grid-cols-2">
              <Field label="Issue" value={selected.issue} /><Field label="Location" value={selected.summaryLocation} />
              <Field label="Issue type" value={selected.structuredIssueType} /><Field label="Urgency" value={selected.structuredUrgency} />
              <Field label="Date / time observed" value={selected.observedAt || 'Missing — clarification required'} /><Field label="Danger / safety" value={selected.danger || 'Missing — clarification required'} />
              <div className="md:col-span-2"><Field label="Description / summary" value={selected.structuredDescription} /></div>
              <Field label="Previous City Action" value={selected.previousCityAction} /><Field label="Department routing" value={departmentDisplay(selected)} />
            </div>}
            <div className="mt-7 rounded-xl bg-amber-50 p-5"><h3 className="font-bold text-amber-950">Clarification requested</h3><ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-slate-700">{clarificationQuestions(selected).map((q,i) => <li key={i}>{q}</li>)}</ul>{!clarificationQuestions(selected).length && <p className="mt-2 text-sm text-slate-700">No outstanding critical clarification questions. Verify the source before deciding.</p>}</div>
            <div className="mt-7 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:flex-wrap">
              <button type="button" className="btn btn-ghost" disabled={Boolean(checkingId)} onClick={() => setEditing(true)} data-testid="button-edit-report"><Pencil size={16} />Edit fields</button>
              <button type="button" className="btn btn-ghost" disabled={Boolean(checkingId)} onClick={() => updateStatus('More Information Requested')} data-testid="button-request-information"><CircleHelp size={16} />Request more information</button>
              <button type="button" className="btn btn-danger sm:ml-auto" disabled={Boolean(checkingId)} onClick={() => updateStatus('Recommendation Rejected')} data-testid="button-reject-report"><X size={16} />Reject recommendation</button>
              <button type="button" className="btn btn-primary" disabled={routingHeld(selected) || editing || Boolean(checkingId)} onClick={() => updateStatus('Human Approved')} data-testid="button-approve-report"><Check size={16} />Approve</button>
            </div>
            {routingHeld(selected) && <p className="mt-3 text-xs font-semibold text-amber-950">Approval is disabled until the AI check is completed and critical clarifications are recorded.</p>}
          </div>
        </div>
      </section>
    </div>
  </div>;
}
function StatusPill({ status }: { status: Status }) {
  return <span className="badge bg-blue-100 text-blue-900" data-testid={`status-${status.toLowerCase().replaceAll(' ','-')}`}>{status === 'Awaiting City Review' ? 'Awaiting demo review' : status === 'AI Structured' ? 'AI Draft' : status}</span>;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><p className="eyebrow text-slate-600">{label}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{value}</p></div>;
}
function EditField({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (v: string) => void }) {
  return <div><label className="field-label" htmlFor={`edit-${id}`}>{label}</label><input id={`edit-${id}`} className="field-input" maxLength={1000} value={value} onChange={e => onChange(e.target.value)} data-testid={`input-edit-${id}`} /></div>;
}