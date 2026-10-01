import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useAnalyzeCivicReport } from '@workspace/api-client-react';
import { AlertTriangle, ArrowRight, FileText, Paperclip, Sparkles } from 'lucide-react';
import { applyAnalysis, type Report } from '@/lib/report-analysis';

export function ResidentSubmit({ sample, onSave }: { sample: Report; onSave: (report: Report) => void }) {
  const [, navigate] = useLocation();
  const analysis = useAnalyzeCivicReport();
  const [form, setForm] = useState({
    residentName: sample.residentName, description: sample.description, location: sample.location,
    issueType: sample.issueType, urgency: sample.urgency, observedAt: '', requestedDepartment: '', danger: 'Not sure',
  });
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const update = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent || processing) return;
    setProcessing(true); setError('');
    try {
      const { residentName: _name, ...input } = form;
      const result = await analysis.mutateAsync({ data: input });
      const report: Report = {
        ...sample, ...form, id: `SJSR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        submittedAt: new Date().toISOString(), sourceObservedAt: form.observedAt,
        sourceDanger: form.danger, analysis: undefined, resolutions: {},
      };
      onSave(applyAnalysis(report, result));
      navigate('/confirmation');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unknown analysis error.';
      setError(`The AI check did not finish, so no draft was created or routed. Your form is retained. Please retry. ${message}`);
    } finally { setProcessing(false); }
  };
  if (processing) return <div className="shell-width flex min-h-[65vh] items-center justify-center py-16">
    <div className="card w-full max-w-xl p-8 text-center" role="status" aria-live="polite">
      <Sparkles className="pulse-dot mx-auto text-blue-800" size={30} />
      <h1 className="display mt-5 text-3xl text-slate-900">Checking contradictions before drafting…</h1>
      <p className="mt-4 text-sm leading-6 text-slate-700">AI is comparing urgency, location, date, issue details, department, and danger. Conflicts will be preserved, not guessed away.</p>
      <p className="mt-3 text-xs text-slate-600">This can take up to a minute. No routing or human decision is happening.</p>
    </div>
  </div>;
  return <div className="page-enter shell-width py-12 md:py-16">
    <p className="eyebrow text-blue-800">Make a Report · resident reporting</p>
    <h1 className="display mt-2 text-4xl text-slate-900">What needs attention?</h1>
    <p className="mt-3 max-w-2xl leading-7 text-slate-600">Describe only what you know. Unclear or conflicting details will become clarification questions—not assumed facts.</p>
    <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_330px]">
      <form onSubmit={submit} className="card p-5 md:p-8">
        <h2 className="mb-6 flex items-center gap-2 font-bold text-slate-900"><FileText size={19} />Report details</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div><label className="field-label" htmlFor="residentName">Your name</label><input id="residentName" className="field-input" maxLength={150} value={form.residentName} onChange={e => update('residentName', e.target.value)} data-testid="input-resident-name" /></div>
          <div><label className="field-label" htmlFor="location">Where did you notice the issue?</label><input id="location" className="field-input" maxLength={300} value={form.location} placeholder="Example: 200 E Santa Clara St, near the intersection with S 3rd St" aria-describedby="location-guidance" onChange={e => update('location', e.target.value)} data-testid="input-location" /><span id="location-guidance" className="field-hint">Enter the street address if known. You can also provide the nearest intersection, cross street, landmark, or bus stop.</span></div>
        </div>
        <div className="mt-6"><label className="field-label" htmlFor="description">What did you observe?</label><textarea id="description" className="field-input min-h-[145px]" maxLength={6000} value={form.description} onChange={e => update('description', e.target.value)} data-testid="input-description" required /><span className="field-hint">Include relevant details even if they conflict. AI cannot independently verify them.</span></div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div><label className="field-label" htmlFor="issueType">Issue type</label><select id="issueType" className="field-input" value={form.issueType} onChange={e => update('issueType', e.target.value)} data-testid="select-issue-type"><option>Trash / debris</option><option>Blocked sidewalk</option><option>Unsafe living condition</option><option>Other</option></select></div>
          <div><label className="field-label" htmlFor="urgency">How urgent does it feel?</label><select id="urgency" className="field-input" value={form.urgency} onChange={e => update('urgency', e.target.value)} data-testid="select-urgency"><option>High</option><option>Medium</option><option>Low</option><option>Not sure</option></select><span className="field-hint">Your selection is preserved. Reported safety indicators may require a higher AI-recommended urgency for human review.</span></div>
          <div><label className="field-label" htmlFor="observedAt">When did you observe it? <span className="font-normal">(if known)</span></label><input id="observedAt" className="field-input" maxLength={120} placeholder="Date, time, or your own words" value={form.observedAt} onChange={e => update('observedAt', e.target.value)} data-testid="input-observed-at" /><span className="field-hint">Observation time is different from submission time.</span></div>
          <div><label className="field-label" htmlFor="danger">Is the situation dangerous?</label><select id="danger" className="field-input" value={form.danger} onChange={e => update('danger', e.target.value)} data-testid="select-danger"><option>Not sure</option><option>Dangerous</option><option>Not dangerous</option></select></div>
        </div>
        <div className="mt-6"><label className="field-label" htmlFor="requestedDepartment">Department mentioned or requested <span className="font-normal">(if known)</span></label><input id="requestedDepartment" className="field-input" maxLength={120} placeholder="Leave blank if you do not know" value={form.requestedDepartment} onChange={e => update('requestedDepartment', e.target.value)} data-testid="input-requested-department" /><span className="field-hint">A resident request is not a verified routing decision. A human reviewer confirms the department.</span></div>
        <div className="mt-6"><label className="field-label" htmlFor="photo">Add a photo <span className="font-normal">(optional)</span></label>
          <div className="flex items-center gap-3"><label htmlFor="photo" className="btn btn-ghost cursor-pointer"><Paperclip size={16} />Choose file<input id="photo" type="file" accept="image/*" className="sr-only" onChange={e => setPhoto(e.target.files?.[0]?.name ?? '')} data-testid="input-photo" /></label><span className="truncate text-xs text-slate-600">{photo || 'No photo selected'}</span></div>
          <span className="field-hint">Photo selection is a demo only; the photo is not saved, uploaded, or analyzed.</span>
        </div>
        <label className="mt-7 flex items-start gap-3 rounded-lg bg-blue-50 p-4 text-sm leading-6 text-slate-800"><input type="checkbox" className="mt-1.5" checked={consent} onChange={e => setConsent(e.target.checked)} required data-testid="checkbox-ai-consent" /><span>I agree to send the report description and report fields to OpenAI through Replit for the AI check. The separate name field and photo are excluded; personal details typed in the description are still sent.</span></label>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900" role="alert" data-testid="text-submit-analysis-error">{error}</p>}
        <div className="mt-7 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-600">Class prototype. No report is sent to the City.</p><button type="submit" disabled={!consent || processing} className="btn btn-primary" data-testid="button-submit-report">Submit Report <ArrowRight size={17} /></button></div>
      </form>
      <aside className="space-y-4">
        <div className="card bg-amber-50 p-5"><h2 className="flex items-center gap-2 font-bold text-amber-950"><AlertTriangle size={19} />Clarification comes first</h2><p className="mt-3 text-sm leading-6 text-slate-700">Conflicting statements are kept side by side. Uncertain or missing critical fields hold department routing and prevent a high readiness score.</p><p className="mt-3 text-sm leading-6 text-slate-700">A person must verify the clarification and make the final decision. AI can make mistakes.</p></div>
        <div className="card p-5"><h2 className="font-bold text-slate-900">Privacy in this demo</h2><p className="mt-3 text-sm leading-6 text-slate-700">Reports and review history are saved in this browser. Report text is sent to the AI provider for analysis; it is not sent to the City. Use synthetic examples and avoid personal or sensitive details.</p></div>
      </aside>
    </div>
  </div>;
}