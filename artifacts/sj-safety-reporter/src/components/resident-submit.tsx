import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAnalyzeCivicReport } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Paperclip, Pencil, Sparkles } from 'lucide-react';
import type { Report } from '@/lib/report-analysis';
import { RESIDENT_STEPS, createResidentReport, residentAnalysisInput, validateResidentStep, type ResidentFormState } from '@/lib/resident-experience';
import { EmergencyNote } from '@/components/resident-app';
import '@/components/resident.css';

export function ResidentSubmit({ sample, onSave }: { sample: Report; onSave: (report: Report) => void }) {
  const [, navigate] = useLocation();
  const analysis = useAnalyzeCivicReport();
  const [form, setForm] = useState<ResidentFormState>({ residentName: '', description: '', location: '', issueType: 'Other', urgency: 'Not sure', observedAt: '', requestedDepartment: '', danger: 'Not sure' });
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const update = (f: keyof ResidentFormState, v: string) => setForm(c => ({ ...c, [f]: v }));
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  const next = () => {
    const problem = validateResidentStep(step, form);
    if (problem) { setError(problem); return; }
    setError(''); setStep(s => Math.min(4, s + 1));
  };
  const back = () => { setError(''); setStep(s => Math.max(0, s - 1)); };
  const submit = async () => {
    if (busy.current || !consent) return;
    const problem = validateResidentStep(4, form);
    if (problem) { setError(problem); return; }
    busy.current = true; setProcessing(true); setError('');
    try {
      const result = await analysis.mutateAsync({ data: residentAnalysisInput(form) });
      onSave(createResidentReport(sample, form, result, `SJSR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, new Date().toISOString()));
      navigate('/confirmation');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unknown error.';
      setError(`Your report was not saved or routed. Your answers are kept. Please retry. ${message}`);
    } finally { busy.current = false; setProcessing(false); }
  };
  const onFormSubmit = (e: React.FormEvent) => { e.preventDefault(); if (step < 4) next(); };

  const review: Array<[string, string, number]> = [['Name', form.residentName, 0], ['What happened', form.description, 0], ['Issue type', form.issueType, 0], ['Where', form.location, 1], ['When observed', form.observedAt, 1], ['Photo (demo only, not uploaded)', photo, 1], ['Urgency', form.urgency, 2], ['Dangerous?', form.danger, 2], ['Department mentioned', form.requestedDepartment, 2]];

  return <div className="page-enter">
    <p className="r-eyebrow" style={{ color: '#194784' }}>Make a Report · Step {step + 1} of 5</p>
    <ol className="r-steps" aria-label="Progress">{RESIDENT_STEPS.map((label, i) => <li key={label} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} data-testid={`step-indicator-${i + 1}`} aria-current={i === step ? 'step' : undefined}><span className="sr-only">{label}</span></li>)}</ol>
    <h1 ref={heading} tabIndex={-1} style={{ fontFamily: 'var(--app-font-serif)', fontWeight: 800, letterSpacing: '-.04em', fontSize: '1.9rem', margin: '0 0 14px', outline: 'none' }} data-testid="text-step-title">{RESIDENT_STEPS[step]}</h1>
    <p className="sr-only" role="status" aria-live="polite" data-testid="status-step">Step {step + 1} of 5: {RESIDENT_STEPS[step]}</p>
    <form key={step} onSubmit={onFormSubmit} className="r-card r-step-panel" noValidate>
      {step === 0 && <>
        <div className="r-field"><label className="field-label" htmlFor="description">What did you observe?</label><textarea id="description" className="field-input" maxLength={6000} value={form.description} onChange={e => update('description', e.target.value)} data-testid="input-description" aria-invalid={!!error} /><span className="field-hint">Describe only what you know, even if details conflict. AI cannot verify them.</span></div>
        <div className="r-field"><label className="field-label" htmlFor="issueType">Issue type</label><select id="issueType" className="field-input" value={form.issueType} onChange={e => update('issueType', e.target.value)} data-testid="select-issue-type"><option>Trash / debris</option><option>Blocked sidewalk</option><option>Unsafe living condition</option><option>Other</option></select></div>
        <div className="r-field"><label className="field-label" htmlFor="residentName">Your name <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="residentName" className="field-input" maxLength={150} value={form.residentName} onChange={e => update('residentName', e.target.value)} data-testid="input-resident-name" /><span className="field-hint">Your name is not sent to the AI check.</span></div>
      </>}
      {step === 1 && <>
        <div className="r-field"><label className="field-label" htmlFor="location">Where did you notice the issue?</label><input id="location" className="field-input" maxLength={300} value={form.location} placeholder="Example: 200 E Santa Clara St, near the intersection with S 3rd St" aria-describedby="location-guidance" onChange={e => update('location', e.target.value)} data-testid="input-location" /><span id="location-guidance" className="field-hint">Enter the address if you know it. You can also provide a nearby intersection, landmark, or bus stop.</span></div>
        <div className="r-field"><label className="field-label" htmlFor="observedAt">When did you observe it? <span style={{ fontWeight: 400 }}>(if known)</span></label><input id="observedAt" className="field-input" maxLength={120} placeholder="Date, time, or your own words" value={form.observedAt} onChange={e => update('observedAt', e.target.value)} data-testid="input-observed-at" /></div>
        <div className="r-field"><label className="field-label" htmlFor="photo">Add a photo <span style={{ fontWeight: 400 }}>(optional)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><label htmlFor="photo" className="r-btn r-btn-ghost" style={{ cursor: 'pointer' }}><Paperclip size={16} />Choose file<input id="photo" type="file" accept="image/*" className="sr-only" onChange={e => setPhoto(e.target.files?.[0]?.name ?? '')} data-testid="input-photo" /></label><span style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo || 'No photo selected'}</span></div>
          <span className="field-hint">Demo only. The photo is not saved, uploaded, or analyzed.</span></div>
      </>}
      {step === 2 && <>
        <div className="r-field"><label className="field-label" htmlFor="urgency">How urgent does it feel?</label><select id="urgency" className="field-input" value={form.urgency} onChange={e => update('urgency', e.target.value)} data-testid="select-urgency"><option>High</option><option>Medium</option><option>Low</option><option>Not sure</option></select><span className="field-hint">Your choice is preserved. Safety indicators may lead to a higher AI recommendation for human review.</span></div>
        <div className="r-field"><label className="field-label" htmlFor="danger">Is the situation dangerous?</label><select id="danger" className="field-input" value={form.danger} onChange={e => update('danger', e.target.value)} data-testid="select-danger"><option>Not sure</option><option>Dangerous</option><option>Not dangerous</option></select></div>
        <details open={!!form.requestedDepartment}><summary>Department you know of (optional)</summary><div><label className="field-label" htmlFor="requestedDepartment">Department mentioned or requested</label><input id="requestedDepartment" className="field-input" maxLength={120} placeholder="Leave blank if you do not know" value={form.requestedDepartment} onChange={e => update('requestedDepartment', e.target.value)} data-testid="input-requested-department" /><span className="field-hint">A request is not a routing decision. A human reviewer confirms the department.</span></div></details>
        <div style={{ marginTop: 14 }}><EmergencyNote /></div>
      </>}
      {step === 3 && <dl data-testid="review-summary">{review.map(([label, value, target]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #dbe5f1', paddingBottom: 10 }}><div style={{ minWidth: 0 }}><dt>{label}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{value.trim() ? value : 'Not provided'}</dd></div><button type="button" className="r-icon-btn" style={{ flex: 'none' }} aria-label={`Edit ${label}`} onClick={() => setStep(target)}><Pencil size={16} /></button></div>)}</dl>}
      {step === 4 && <>
        <p style={{ fontSize: '.92rem', lineHeight: 1.6, marginTop: 0 }}>Last step. Your exact entries will be checked by AI, then saved in this browser for a demo human review. Nothing is sent to the City.</p>
        <label style={{ display: 'flex', gap: 12, alignItems: 'start', background: '#ecf3fb', borderRadius: 14, padding: 14, fontSize: '.88rem', lineHeight: 1.55 }}><input type="checkbox" style={{ width: 22, height: 22, marginTop: 2, flex: 'none' }} checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-ai-consent" /><span>I agree to send the report description and report fields to OpenAI through Replit for the AI check. The separate name field and photo are excluded; personal details typed in the description are still sent.</span></label>
      </>}
      {error && <p className="r-err" role="alert" style={{ marginTop: 14 }} data-testid="text-submit-analysis-error">{error}</p>}
      {processing && <p role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.88rem', marginTop: 14 }}><Sparkles size={18} className="pulse-dot" aria-hidden="true" />Checking your report. This can take up to a minute. Nothing is routed.</p>}
      <div className="r-actions" style={{ marginTop: 18 }}>
        {step > 0 && <button type="button" className="r-btn r-btn-ghost" onClick={back} disabled={processing} data-testid="button-report-back"><ArrowLeft size={16} />Back</button>}
        {step < 4 ? <button key="next" type="submit" className="r-btn r-btn-solid" data-testid="button-report-next">{step === 3 ? 'Continue' : 'Next'}<ArrowRight size={16} /></button>
          : <button key="submit" type="button" className="r-btn r-btn-solid" onClick={submit} disabled={!consent || processing} data-testid="button-submit-report">{processing ? 'Submitting…' : error ? 'Retry Submit' : 'Submit Report'}</button>}
      </div>
    </form>
  </div>;
}
