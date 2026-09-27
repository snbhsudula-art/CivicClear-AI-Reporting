import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  AlertTriangle, ArrowRight, Check, ChevronRight, ClipboardCheck, Clock3, FileText,
  Info, Landmark, MapPin, Menu, Paperclip, Pencil, ShieldCheck, Sparkles, Trash2,
  UserRound, X, CircleHelp,
} from 'lucide-react';

type Status = 'Awaiting City Review' | 'AI Structured' | 'Human Review' | 'More Information Requested' | 'Human Approved' | 'Recommendation Rejected';
type Report = {
  id: string; submittedAt: string; residentName: string; description: string; location: string;
  issueType: string; urgency: string; status: Status; issue: string; summaryLocation: string;
  structuredIssueType: string; structuredUrgency: string; structuredDescription: string;
  previousCityAction: string; missingInformation: string[]; suggestedDepartment: string;
  humanEdits: string; reviewNote: string;
};

const STORAGE_KEY = 'sj-safety-reporter-reports';
const AUTH_STORAGE_KEY = 'sj-safety-reporter-prototype-access';
const PROTOTYPE_PASSWORD = 'SJSU2026';
const seedReport: Report = {
  id: 'SJSR-2048', submittedAt: '2025-04-18T09:42:00', residentName: 'Marcus Lee',
  description: 'There is a large amount of trash and debris blocking the sidewalk near the downtown area. People using wheelchairs and pedestrians have to walk into the street to get around it. I noticed it this morning and it is still there.',
  location: 'Downtown San José', issueType: 'Trash / debris', urgency: 'Medium',
  status: 'Human Review', issue: 'Blocked sidewalk / debris',
  summaryLocation: 'Downtown San José', structuredIssueType: 'Public safety / accessibility',
  structuredUrgency: 'Medium', structuredDescription: 'Sidewalk is blocked by trash and debris.',
  previousCityAction: 'Unknown', missingInformation: ['Exact address or nearest cross street', 'Whether the walkway is completely blocked', 'Whether this was reported to the City before'],
  suggestedDepartment: 'San José Housing Department', humanEdits: '', reviewNote: '',
};

function loadReports(): Report[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Report[];
  } catch { /* use seed when local storage is unavailable */ }
  return [seedReport];
}

function formatDate(value: string, long = false) {
  return new Intl.DateTimeFormat('en-US', { month: long ? 'long' : 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function StatusBadge({ status }: { status: Status }) {
  const tone = status === 'Human Approved' ? 'bg-[#d8eee4] text-[#185a49]' : status === 'Recommendation Rejected' ? 'bg-[#f3d9d4] text-[#873d34]' : status === 'More Information Requested' ? 'bg-[#f9e8bb] text-[#6f4b0c]' : 'bg-[#dcecef] text-[#245667]';
  return <span className={`badge ${tone}`} data-testid={`status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>;
}

function isUsable(value: string, allowOther = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'unknown' || normalized === 'not sure') return false;
  if (!allowOther && normalized === 'other') return false;
  return true;
}

function getReportReadiness(report: Report) {
  const issue = isUsable(report.issue);
  const location = isUsable(report.summaryLocation);
  const issueType = isUsable(report.structuredIssueType, false);
  const urgency = isUsable(report.structuredUrgency, false);
  const description = isUsable(report.description) || isUsable(report.structuredDescription);
  const previousCityAction = isUsable(report.previousCityAction);
  const exactLocation = location && /address|street|st\.|avenue|ave\.|road|rd\.|way|cross|intersection|\d{2,}/i.test(report.summaryLocation);
  const score = Math.round(
    (issue ? 15 : 0) +
    (location ? (exactLocation ? 20 : 17) : 0) +
    (issueType ? 15 : 0) +
    (urgency ? 10 : 0) +
    (description ? 25 : 0) +
    (previousCityAction ? 15 : 0),
  );
  const missing = [
    ...(!exactLocation ? ['Exact address'] : []),
    ...(!previousCityAction ? ['Previous City action'] : []),
  ];
  return {
    score,
    found: [
      { label: 'Issue clearly described', complete: issue && description },
      { label: 'Location identified', complete: location },
      { label: 'Safety concern identified', complete: issueType },
      { label: 'Time reported', complete: Boolean(report.submittedAt && !Number.isNaN(new Date(report.submittedAt).getTime())) },
    ],
    missing,
  };
}

function ReportReadiness({ report }: { report: Report }) {
  const readiness = getReportReadiness(report);
  return <section className="card overflow-hidden border-[#7da9a7] bg-[#e3efeb]" data-testid="report-readiness">
    <div className="flex flex-col gap-5 border-b border-[#bfd6d0] bg-[#d6e9e3] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-7">
      <div>
        <p className="eyebrow text-[#33717c]">AI-generated assessment</p>
        <h2 className="mt-2 text-xl font-bold uppercase tracking-[.08em] text-[#1f5362]">REPORT READINESS</h2>
      </div>
      <div className="flex items-end gap-3">
        <span className="font-mono text-4xl font-medium leading-none text-[#1f5362]" data-testid="text-readiness-score">{readiness.score}%</span>
        <span className="pb-1 text-xs font-semibold text-[#52716f]">ready for review</span>
      </div>
    </div>
    <div className="px-5 py-5 md:px-7">
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-[#bdd3cc]"><div className="h-full rounded-full bg-[#33717c] transition-all" style={{ width: `${readiness.score}%` }} /></div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow text-[#33717c]">AI found</p>
          <ul className="mt-3 space-y-2">{readiness.found.map((item) => <li key={item.label} className={`flex items-start gap-2 text-sm ${item.complete ? 'text-[#2d5e58]' : 'text-[#806b3a]'}`}><span className="mt-0.5 font-bold">{item.complete ? '✓' : '⚠'}</span><span>{item.label}</span></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow text-[#8a681f]">Missing information</p>
          <ul className="mt-3 space-y-2">{readiness.missing.length > 0 ? readiness.missing.map((item) => <li key={item} className="flex items-start gap-2 text-sm text-[#705a2d]"><span className="mt-0.5 font-bold">⚠</span><span>{item}</span></li>) : <li className="text-sm text-[#2d5e58]">No key fields are missing.</li>}</ul>
        </div>
      </div>
      <p className="mt-6 border-t border-[#bfd6d0] pt-4 text-xs leading-5 text-[#52716f]">Report readiness indicates how much information was successfully extracted. A human City employee must still review the report.</p>
    </div>
  </section>;
}

function displayExtractedValue(value: string | undefined) {
  const normalized = value ?? '';
  return isUsable(normalized) ? normalized : 'Missing';
}

function residentExcerpt(text: string, priority?: RegExp) {
  const sentences = text.trim().split(/(?<=[.!?])\s/);
  const sentence = (priority ? sentences.find((part) => priority.test(part)) : undefined) ?? sentences[0] ?? '';
  if (sentence.length <= 145) return sentence;
  const shortened = sentence.slice(0, 142);
  return `${shortened.slice(0, shortened.lastIndexOf(' '))}…`;
}

function fieldExplanation(report: Report, field: 'issue' | 'location' | 'type' | 'urgency' | 'missing', item?: string) {
  const excerpt = residentExcerpt(report.description);
  if (field === 'issue') {
    return excerpt
      ? `The resident wrote: “${excerpt}” Compare the draft issue with their words; it has not been independently verified.`
      : isUsable(report.issueType)
        ? `The resident selected “${report.issueType}” as the issue type, but provided no description to support a more specific issue label.`
        : 'The resident did not provide a description to support this draft issue. A person must verify it.';
  }
  if (field === 'location') {
    return isUsable(report.location)
      ? `The resident entered “${report.location}” as the location. This is their submitted location, not a verified address.`
      : 'The resident did not enter a location. Check their original description before using this draft location.';
  }
  if (field === 'type') {
    return isUsable(report.issueType)
      ? `The resident selected “${report.issueType}”. The structured issue type is a draft categorization for human review.`
      : 'The resident did not select a specific issue type. This draft category needs human review.';
  }
  if (field === 'urgency') {
    const urgencyEvidence = residentExcerpt(report.description, /street|injur|emergen|danger|pedestrian/i);
    return isUsable(report.urgency, false)
      ? `The resident selected “${report.urgency}” as urgency.${urgencyEvidence ? ` Their description says: “${urgencyEvidence}”` : ''} ${report.structuredUrgency !== report.urgency ? 'The draft urgency differs from their selection and needs review.' : 'No independent urgency assessment was made.'}`
      : 'The resident did not choose a specific urgency. The draft urgency needs human review.';
  }
  if (item && /address|cross street|intersection/i.test(item)) {
    return isUsable(report.location)
      ? `The resident entered “${report.location}” as the location. Check their original description to see whether it adds the address detail requested here.`
      : 'No location was entered in the location field. Check the resident’s original description for address details.';
  }
  if (item && /reported to the city|previous city action/i.test(item)) {
    return 'Previous City action was not separately supplied. Check the resident’s original description before asking for it.';
  }
  return 'The draft flags this detail for confirmation. Check the resident’s original description; this information has not been verified.';
}

function WhyExplanation({ explanation, name }: { explanation: string; name: string }) {
  const [open, setOpen] = useState(false);
  return <div className={`min-w-0 max-w-full ${open ? 'w-full' : ''}`} data-testid={`why-${name}`}>
    <button type="button" aria-label={`Why? AI explanation for ${name.replaceAll('-', ' ')}`} aria-expanded={open} aria-controls={`explanation-${name}`} onClick={() => setOpen(!open)} className="rounded-md border border-[#b7d1ca] bg-white px-2 py-0.5 text-xs font-semibold text-[#286071] hover:bg-[#dcecef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#286071]">Why?</button>
    {open && <p id={`explanation-${name}`} className="mt-2 rounded-md border border-[#b7d1ca] bg-[#f8fbf8] p-3 text-xs font-normal leading-5 text-[#3e5960]"><strong className="block text-[#1f5362]">AI explanation · resident-provided information only</strong>{explanation}</p>}
  </div>;
}

function ExplainableField({ label, value, explanation, name }: { label: string; value: string; explanation: string; name: string }) {
  return <div className="min-w-0 border-b border-[#d4e2dd] pb-3">
    <div className="flex flex-wrap items-center gap-2"><p className="eyebrow text-[#73817d]">{label}</p><WhyExplanation name={name} explanation={explanation} /></div>
    <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#304f56]">{value}</p>
  </div>;
}

function BeforeAfterAI({ report }: { report: Report }) {
  const missingItems = report.missingInformation.filter((item) => isUsable(item));
  return <section className="mt-8" data-testid="before-after-ai">
    <div className="mb-5">
      <p className="eyebrow text-[#33717c]">Transformation view</p>
      <h2 className="display mt-2 text-3xl text-[#1e4350]">Before &amp; After AI</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617174]">See how the resident’s own words become a structured draft without filling in facts that were not provided.</p>
    </div>
    <div className="grid items-stretch gap-4 md:grid-cols-[1fr_120px_1fr]">
      <article className="card flex flex-col border-[#d5c9b7] bg-[#fbf7ef] p-5 md:p-6">
        <p className="eyebrow text-[#8a681f]">Unstructured report</p>
        <h3 className="mt-2 text-lg font-bold text-[#284b55]">Original Resident Report</h3>
        <blockquote className="mt-5 flex-1 border-l-2 border-[#c98945] pl-4 text-sm leading-7 text-[#4f6265]">“{report.description.trim() ? report.description : 'Missing'}”</blockquote>
      </article>
      <div className="flex items-center justify-center gap-2 py-1 text-center md:flex-col md:py-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dcecef] text-[#1f5362]"><ArrowRight className="rotate-90 md:rotate-0" size={19} /></span>
        <span className="eyebrow max-w-[110px] text-[#33717c]">AI structured extraction</span>
      </div>
      <article className="card border-[#7da9a7] bg-[#edf3ef] p-5 md:p-6">
        <p className="eyebrow text-[#33717c]">Structured information</p>
        <p className="mt-2 text-xs font-semibold text-[#52716f]">AI Draft — Requires Human Review</p>
        <h3 className="mt-2 text-lg font-bold text-[#284b55]">AI Structured Draft</h3>
        <div className="mt-5 grid gap-4">
          <ExplainableField label="Issue" value={displayExtractedValue(report.issue)} name="issue" explanation={fieldExplanation(report, 'issue')} />
          <ExplainableField label="Location" value={displayExtractedValue(report.summaryLocation)} name="location" explanation={fieldExplanation(report, 'location')} />
          <ExplainableField label="Issue Type" value={displayExtractedValue(report.structuredIssueType)} name="type" explanation={fieldExplanation(report, 'type')} />
          <ExplainableField label="Urgency" value={displayExtractedValue(report.structuredUrgency)} name="urgency" explanation={fieldExplanation(report, 'urgency')} />
          <InfoField label="Description" value={displayExtractedValue(report.structuredDescription)} wide />
          <InfoField label="Previous City Action" value={displayExtractedValue(report.previousCityAction)} />
        </div>
        <div className="mt-5 border-t border-[#cbded8] pt-4">
          <div className="flex flex-wrap items-center gap-2"><p className="eyebrow text-[#8a681f]">Missing Information</p><WhyExplanation name="missing-information" explanation="These draft flags ask a person to check details against the resident’s submission. No outside records were consulted." /></div>
          {missingItems.length > 0 ? <ul className="mt-2 space-y-2 text-sm leading-6 text-[#705a2d]">{missingItems.map((item, index) => <li key={`${item}-${index}`} className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1">• {item}</span><WhyExplanation name={`missing-${index}`} explanation={fieldExplanation(report, 'missing', item)} /></li>)}</ul> : <p className="mt-2 text-sm text-[#2d5e58]">Missing</p>}
        </div>
      </article>
    </div>
  </section>;
}

function PrototypeMark({ dark = false }: { dark?: boolean }) {
  return <div className={`flex items-center gap-2 text-[.68rem] font-semibold ${dark ? 'text-[#d6e6e5]' : 'text-[#52666c]'}`}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f2bb67] text-[#1c3f4a]"><Landmark size={12} strokeWidth={2.5} /></span><span>Prototype — Not an Official City of San José Service</span></div>;
}

function Header({ onLogout }: { onLogout: () => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const nav = [{ href: '/', label: 'Overview' }, { href: '/submit', label: 'Resident report' }, { href: '/my-report', label: 'My report' }, { href: '/staff', label: 'Staff review' }];
  return <header className="sticky top-0 z-10 border-b border-[#cfd8d5] bg-[#f8f3e8]/95 backdrop-blur">
    <div className="shell-width flex min-h-[70px] items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-3 no-underline" onClick={() => setOpen(false)} data-testid="link-brand">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f5362] text-[#f9e4b2]"><ShieldCheck size={21} /></span>
        <span><strong className="block text-sm tracking-[-.01em] text-[#1d3c48]">Safety Reporter</strong><span className="block text-[.67rem] text-[#6a7778]">San José prototype</span></span>
      </Link>
      <button className="btn btn-ghost btn-sm md:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation" data-testid="button-toggle-navigation">{open ? <X size={17} /> : <Menu size={17} />}</button>
      <nav className={`${open ? 'absolute left-3 right-3 top-[65px] flex' : 'hidden'} card flex-col gap-1 p-2 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`} aria-label="Primary navigation">
        {nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`rounded-md px-3 py-2 text-sm font-semibold no-underline transition-colors ${location === item.href ? 'bg-[#dcecef] text-[#1f5362]' : 'text-[#556569] hover:bg-[#ece8dd] hover:text-[#1f5362]'}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>{item.label}</Link>)}
        <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-[#7d4b3f] transition-colors hover:bg-[#f3d9d4] md:text-center" data-testid="button-logout">Log out</button>
      </nav>
    </div>
  </header>;
}

function Footer() {
  return <footer className="mt-16 border-t border-[#cfd8d5] bg-[#e7eee9]"><div className="shell-width flex flex-col gap-4 py-7 text-sm text-[#52666c] md:flex-row md:items-center md:justify-between"><PrototypeMark /><p className="max-w-xl text-xs leading-5">This class prototype does not send reports to the real City of San José. It demonstrates how AI could organize information for human review.</p></div></footer>;
}

function Shell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  return <div className="app-shell noise"><Header onLogout={onLogout} /><main>{children}</main><Footer /></div>;
}

function Home() {
  return <div className="page-enter">
    <section className="soft-grid overflow-hidden border-b border-[#cfd8d5]">
      <div className="shell-width grid gap-12 py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-24">
        <div><PrototypeMark /><p className="eyebrow mt-9 text-[#33717c]">A clear path from concern to review</p><h1 className="display mt-4 max-w-[680px] text-5xl leading-[.98] text-[#1e4350] md:text-7xl">Turn an unclear report into a <em className="not-italic text-[#b86e40]">useful record.</em></h1><p className="prose-copy mt-7 text-lg text-[#56676a]">Safety Reporter is a presentation prototype for reporting unsafe conditions related to homelessness in San José. It helps residents share what they know, then shows a City worker exactly what still needs checking.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/submit" className="btn btn-primary no-underline" data-testid="link-start-report">Start a sample report <ArrowRight size={17} /></Link><Link href="/staff" className="btn btn-ghost no-underline" data-testid="link-open-staff">Open staff review <ChevronRight size={17} /></Link></div><div className="mt-7 flex items-center gap-2 text-xs font-semibold text-[#6b7674]"><Info size={15} className="text-[#33717c]" /> Human review is required before action.</div></div>
        <div className="relative"><div className="absolute -right-8 -top-9 h-28 w-28 rounded-full border-[18px] border-[#f2bb67]/60" /><div className="card relative mx-auto max-w-[430px] overflow-hidden border-[#a9c5c3] bg-[#f5f4ec]"><div className="flex items-center justify-between border-b border-[#d2dcd6] bg-[#e3efeb] px-5 py-4"><span className="eyebrow text-[#33717c]">Report preview</span><span className="badge bg-[#f9e8bb] text-[#6f4b0c]"><Sparkles size={12} /> AI draft</span></div><div className="p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d4e7e4] text-[#1f5362]"><AlertTriangle size={18} /></span><div><p className="text-xs font-semibold text-[#73807d]">ISSUE</p><p className="font-bold text-[#284b55]">Blocked sidewalk access</p></div></div><div className="my-6 space-y-4"><div><p className="eyebrow text-[#78817c]">What we know</p><p className="mt-1 text-sm leading-6 text-[#42595e]">Trash and broken items may be affecting wheelchair and pedestrian access.</p></div><div className="rounded-md border border-[#e4bb67] bg-[#fff6dc] p-3"><p className="eyebrow text-[#8b651d]">Still needed</p><p className="mt-1 text-sm font-semibold text-[#75591f]">Exact address · blockage extent</p></div></div><div className="flex items-center justify-between border-t border-[#d2dcd6] pt-4 text-xs text-[#6d7b78]"><span>Suggested: Housing Department</span><span className="flex items-center gap-1"><Clock3 size={13} /> review</span></div></div></div></div>
      </div>
    </section>
    <section className="shell-width grid gap-5 py-16 md:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow text-[#33717c]">How this demo works</p><h2 className="display mt-3 text-4xl text-[#1e4350]">Information, not assumptions.</h2><p className="mt-4 max-w-md leading-7 text-[#5b6a6d]">The experience keeps unknowns visible. AI can organize a resident’s words, but it cannot fill gaps or make a City decision.</p></div><div className="grid gap-4 sm:grid-cols-3">{[['01','Describe','Share the situation in your own words.'],['02','Structure','The prototype separates facts from missing details.'],['03','Review','A human decides what happens next.']].map(([number,title,copy]) => <div className="card p-5" key={number}><span className="font-mono text-sm text-[#b86e40]">{number}</span><h3 className="mt-8 font-bold text-[#284b55]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#687674]">{copy}</p></div>)}</div></section>
    <section className="bg-[#1f5362] text-[#f7f2e7]"><div className="shell-width flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between"><div><p className="eyebrow text-[#b8d9d5]">For the class presentation</p><h2 className="display mt-2 text-3xl">See both sides of the handoff.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#d2e3df]">Submit as Marcus, then switch to Robert’s review desk to see the AI draft, missing information, and human decision controls.</p></div><Link href="/staff" className="btn btn-secondary self-start no-underline" data-testid="link-see-review">See the review desk <ArrowRight size={16} /></Link></div></section>
  </div>;
}

function StepHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="mb-8"><p className="eyebrow text-[#33717c]">{eyebrow}</p><h1 className="display mt-2 text-4xl leading-tight text-[#1e4350] md:text-5xl">{title}</h1><p className="mt-3 max-w-2xl leading-7 text-[#617174]">{copy}</p></div>;
}

function Submit() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ residentName: 'Marcus Lee', description: seedReport.description, location: seedReport.location, issueType: seedReport.issueType, urgency: seedReport.urgency });
  const [photo, setPhoto] = useState('');
  const [processing, setProcessing] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); setProcessing(true); setTimeout(() => {
    const isAccessConcern = form.issueType === 'Trash / debris' || form.issueType === 'Blocked sidewalk';
    const next: Report = { ...seedReport, ...form, id: `SJSR-${Math.floor(2050 + Math.random() * 800)}`, submittedAt: new Date().toISOString(), status: 'AI Structured', description: form.description, location: form.location, issueType: form.issueType, urgency: form.urgency, issue: isAccessConcern ? 'Blocked sidewalk / debris' : form.issueType, summaryLocation: form.location, structuredIssueType: isAccessConcern ? 'Public safety / accessibility' : form.issueType, structuredUrgency: form.urgency, structuredDescription: isAccessConcern ? (form.description.trim() ? 'Sidewalk access may be affected by the reported condition.' : '') : form.description, missingInformation: ['Exact address or nearest cross street', 'Whether the walkway is completely blocked', 'Whether this was reported to the City before'], previousCityAction: 'Unknown', humanEdits: '', reviewNote: '' };
    const current = loadReports(); localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...current.filter((report) => report.id !== next.id)])); setProcessing(false); setLocation('/confirmation');
  }, 1350); };
  if (processing) return <div className="page-enter shell-width flex min-h-[65vh] items-center justify-center py-16"><div className="card w-full max-w-xl p-8 text-center md:p-12"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dcecef] text-[#1f5362]"><Sparkles className="pulse-dot" size={29} /></div><p className="eyebrow mt-7 text-[#33717c]">One moment</p><h1 className="display mt-3 text-4xl text-[#1e4350]">AI is organizing your report…</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#647376]">It is separating what you observed from what still needs confirmation. No details are being invented.</p><div className="mx-auto mt-8 h-1.5 max-w-xs overflow-hidden rounded-full bg-[#d4e3df]"><div className="progress-fill h-full w-1/2 rounded-full bg-[#33717c]" /></div></div></div>;
  return <div className="page-enter shell-width py-12 md:py-16"><StepHeader eyebrow="Resident report · step 1 of 1" title="What needs attention?" copy="Use your own words. This is a guided prototype, so you can edit the example below or replace it with a different observation." /><div className="grid gap-7 lg:grid-cols-[1fr_330px]"><form onSubmit={submit} className="card p-5 md:p-8"><div className="mb-8 flex items-start gap-3 border-b border-[#d8dfda] pb-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcecef] text-[#1f5362]"><FileText size={17} /></span><div><h2 className="font-bold text-[#284b55]">Report details</h2><p className="mt-1 text-xs leading-5 text-[#697775]">Required fields help the review team understand the concern.</p></div></div><div className="grid gap-6 md:grid-cols-2"><div><label className="field-label" htmlFor="residentName">Your name</label><input id="residentName" className="field-input" value={form.residentName} onChange={(e) => update('residentName', e.target.value)} data-testid="input-resident-name" /></div><div><label className="field-label" htmlFor="location">Where did you notice it?</label><input id="location" className="field-input" value={form.location} onChange={(e) => update('location', e.target.value)} data-testid="input-location" /><span className="field-hint">An address, intersection, or landmark is helpful.</span></div></div><div className="mt-6"><label className="field-label" htmlFor="description">What did you observe?</label><textarea id="description" className="field-input min-h-[145px] resize-y" value={form.description} onChange={(e) => update('description', e.target.value)} data-testid="input-description" /><span className="field-hint">Stick to what you saw. The prototype will flag what is not known.</span></div><div className="mt-6 grid gap-6 md:grid-cols-2"><div><label className="field-label" htmlFor="issueType">Issue type</label><select id="issueType" className="field-input" value={form.issueType} onChange={(e) => update('issueType', e.target.value)} data-testid="select-issue-type"><option>Trash / debris</option><option>Blocked sidewalk</option><option>Unsafe living condition</option><option>Other</option></select></div><div><label className="field-label" htmlFor="urgency">How urgent does it feel?</label><select id="urgency" className="field-input" value={form.urgency} onChange={(e) => update('urgency', e.target.value)} data-testid="select-urgency"><option>High</option><option>Medium</option><option>Low</option><option>Not sure</option></select></div></div><div className="mt-6"><label className="field-label" htmlFor="photo">Add a photo <span className="font-normal text-[#74817e]">(optional)</span></label><div className="flex items-center gap-3"><label htmlFor="photo" className="btn btn-ghost cursor-pointer"><Paperclip size={16} /> Choose file<input id="photo" type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? '')} data-testid="input-photo" /></label><span className="truncate text-xs text-[#687674]">{photo || 'No photo selected'}</span></div></div><div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-[#d8dfda] pt-6 sm:flex-row sm:items-center"><p className="text-xs leading-5 text-[#6a7778]">By continuing, you are using a class prototype. It does not contact the City.</p><button type="submit" className="btn btn-primary" data-testid="button-submit-report">Submit report <ArrowRight size={17} /></button></div></form><aside className="space-y-4"><div className="card border-[#e4c477] bg-[#fff7df] p-5"><div className="flex gap-3"><CircleHelp size={19} className="mt-0.5 shrink-0 text-[#9b6c1c]" /><div><h2 className="font-bold text-[#6f521d]">What happens next?</h2><p className="mt-2 text-sm leading-6 text-[#765e2c]">The prototype creates an AI Draft, highlights missing information, and sends it to the staff review view. A person remains responsible for the final decision.</p></div></div></div><div className="card p-5"><p className="eyebrow text-[#33717c]">Privacy in this demo</p><p className="mt-3 text-sm leading-6 text-[#657371]">Your sample stays in this browser’s local storage. It is not transmitted to the real City of San José.</p></div></aside></div></div>;
}

function WorkflowTracker({ report }: { report: Report }) {
  const stages = ['Resident Report', 'AI Extraction', 'Missing Information Check', 'Human Review', 'Human Decision'];
  const decided = report.status === 'Human Approved' || report.status === 'Recommendation Rejected';
  return <section className="card border-[#a9c5c3] bg-[#f3f7f3] p-5 md:p-6" aria-label="Report workflow" data-testid="report-workflow">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <div><p className="eyebrow text-[#33717c]">Report workflow</p><h2 className="mt-1 text-lg font-bold text-[#1f5362]">From report to human decision</h2></div>
      <span className="rounded-full bg-[#e0eae5] px-3 py-1 text-xs font-semibold text-[#2a5c5d]">{decided ? 'Decision recorded' : report.status === 'More Information Requested' ? 'Awaiting more information' : 'Awaiting human decision'}</span>
    </div>
    <ol className="grid gap-5 lg:grid-cols-5 lg:gap-2">
      {stages.map((stage, index) => {
        const completed = decided || index < 3;
        const current = !decided && index === 3;
        const state = completed ? 'Complete' : current ? 'Current' : 'Upcoming';
        return <li key={stage} aria-current={current ? 'step' : undefined} className={`relative flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 lg:flex-col lg:items-start lg:gap-2 lg:px-3 lg:py-4 ${current ? 'border-[#bc8241] bg-[#fff3d8] shadow-sm' : completed ? 'border-[#b9d5ca] bg-white' : 'border-[#d6ded9] bg-[#f8faf7]'}`} data-testid={`workflow-stage-${index + 1}`}>
          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${completed ? 'border-[#33717c] bg-[#33717c] text-white' : current ? 'border-[#ad7531] bg-[#ad7531] text-white' : 'border-[#a9b8b3] bg-transparent text-[#a9b8b3]'}`}>{completed ? <Check size={17} strokeWidth={3} /> : <span className={`rounded-full ${current ? 'h-2.5 w-2.5 bg-white' : 'h-2 w-2 border border-current'}`} />}</span>
          <span className="min-w-0"><span className={`block text-[.65rem] font-bold uppercase tracking-wider ${current ? 'text-[#85591d]' : 'text-[#6a7b76]'}`}>{index + 1} · {state}</span><span className={`mt-0.5 block text-sm font-semibold leading-5 ${current ? 'text-[#654718]' : completed ? 'text-[#285761]' : 'text-[#7b8984]'}`}>{stage}</span></span>
          {index < stages.length - 1 && <ArrowRight aria-hidden="true" size={16} className={`absolute -bottom-[19px] left-5 rotate-90 lg:-right-[13px] lg:bottom-auto lg:left-auto lg:top-7 lg:rotate-0 ${completed ? 'text-[#33717c]' : 'text-[#a9b8b3]'}`} />}
        </li>;
      })}
    </ol>
    <p className="mt-5 border-t border-[#d7e2dc] pt-4 text-xs leading-5 text-[#516a68]">AI assists with extraction and flags missing details. A human reviewer is responsible for the final decision.{report.status === 'Recommendation Rejected' ? ' The recommendation was rejected by a human reviewer.' : ''}</p>
  </section>;
}

function LegacyTimeline({ report, compact = false }: { report: Report; compact?: boolean }) {
  const steps = ['Report Submitted', 'AI Structured', 'Human Review', 'Approved'];
  const complete = report.status === 'Human Approved' ? 4 : report.status === 'Recommendation Rejected' ? 3 : report.status === 'More Information Requested' ? 3 : report.status === 'Human Review' ? 3 : report.status === 'AI Structured' ? 2 : 1;
  return <div className={`${compact ? '' : 'card p-5 md:p-7'}`}><div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-[#284b55]">Report timeline</h2><span className="text-xs font-semibold text-[#71807d]">{complete} of 4 steps</span></div><div className={`${compact ? 'grid gap-3' : 'grid gap-5 sm:grid-cols-4'}`}>{steps.map((step, index) => { const done = index < complete; const active = index === complete - 1; return <div key={step} className={`relative ${!compact && index < 3 ? 'after:absolute after:left-[calc(50%+23px)] after:right-[calc(-50%+23px)] after:top-4 after:h-px after:bg-[#c5d6d1] sm:after:block' : ''}`}><div className={`relative z-[1] flex items-center gap-3 ${!compact ? 'sm:flex-col sm:text-center' : ''}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-[#33717c] bg-[#33717c] text-[#f8f3e8]' : 'border-[#bdccc7] bg-[#f8f3e8] text-[#8b9995]'}`}>{done ? <Check size={15} /> : <span className="text-xs">{index + 1}</span>}</span><span className={`${active ? 'font-bold text-[#1f5362]' : done ? 'font-semibold text-[#536a6d]' : 'text-[#8b9894]'} text-sm`}>{step}</span></div></div>; })}</div>{report.status === 'More Information Requested' && <p className="mt-5 border-t border-[#d8dfda] pt-4 text-xs font-semibold text-[#8a631c]">Waiting for more information from the resident.</p>}{report.status === 'Recommendation Rejected' && <p className="mt-5 border-t border-[#d8dfda] pt-4 text-xs font-semibold text-[#873d34]">The recommendation was rejected by a human reviewer.</p>}</div>;
}

function Timeline({ report, compact = false }: { report: Report; compact?: boolean }) {
  return <div className="space-y-5"><WorkflowTracker report={report} /><LegacyTimeline report={report} compact={compact} /></div>;
}

function Confirmation() {
  const report = loadReports()[0] ?? seedReport;
  return <div className="page-enter shell-width py-12 md:py-16"><div className="mx-auto max-w-3xl">
    <div className="card overflow-hidden">
      <div className="bg-[#1f5362] px-6 py-10 text-[#f7f2e7] md:px-10"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9dd2c2] text-[#1f5362]"><Check size={25} strokeWidth={2.5} /></div><p className="eyebrow mt-7 text-[#b9d9d5]">Report received in this prototype</p><h1 className="display mt-2 text-4xl md:text-5xl">Your report has been received.</h1><p className="mt-4 max-w-lg leading-7 text-[#d8e8e3]">Thank you, {report.residentName.split(' ')[0]}. Your observation is now a structured record for a human City worker to review.</p></div>
      <div className="p-6 md:p-10">
        <div className="grid gap-4 sm:grid-cols-3"><div><p className="eyebrow text-[#73817d]">Report ID</p><p className="mt-2 font-mono text-sm font-semibold text-[#1f5362]" data-testid="text-report-id">{report.id}</p></div><div><p className="eyebrow text-[#73817d]">Submitted</p><p className="mt-2 text-sm font-semibold text-[#304f56]" data-testid="text-submitted-date">{formatDate(report.submittedAt, true)}</p></div><div><p className="eyebrow text-[#73817d]">Status</p><div className="mt-2"><StatusBadge status={report.status === 'AI Structured' ? 'Awaiting City Review' : report.status} /></div></div></div>
        <div className="my-8 divider" />
        <div className="mb-8"><Timeline report={report} /></div>
        <ReportReadiness report={report} />
        <BeforeAfterAI report={report} />
        <div className="mt-8 rounded-md border border-[#a9c5c3] bg-[#edf3ef] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="eyebrow text-[#33717c]">AI Draft · structured summary</p><span className="badge bg-[#dcecef] text-[#245667]">Needs human review</span></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><InfoField label="Issue" value={report.issue} /><InfoField label="Location" value={report.summaryLocation} /><InfoField label="Issue type" value={report.structuredIssueType} /><InfoField label="Urgency" value={report.structuredUrgency} /><InfoField label="Description" value={report.structuredDescription} wide /><InfoField label="Previous City Action" value={report.previousCityAction} /></div><div className="mt-5 border-t border-[#cbded8] pt-4"><p className="eyebrow text-[#8a681f]">Missing information</p><ul className="mt-2 space-y-1 text-sm leading-6 text-[#705a2d]">{report.missingInformation.map((item) => <li key={item}>• {item}</li>)}</ul><p className="mt-4 text-sm font-semibold text-[#425c60]">AI suggested department: {report.suggestedDepartment}</p></div></div>
        <div className="mt-7 rounded-md border border-[#e4c477] bg-[#fff7df] p-4 text-sm leading-6 text-[#73581e]"><strong>Important:</strong> This class prototype does not send reports to the real City of San José. Human review is required before action.</div>
        <div className="mt-7 flex flex-wrap gap-3"><Link href="/my-report" className="btn btn-primary no-underline" data-testid="link-view-my-report">View my report <ArrowRight size={16} /></Link><Link href="/staff" className="btn btn-ghost no-underline" data-testid="link-switch-to-staff">Switch to staff review</Link></div>
      </div>
    </div>
  </div></div>;
}

function MyReport() {
  const report = loadReports()[0] ?? seedReport;
  return <div className="page-enter shell-width py-12 md:py-16">
    <StepHeader eyebrow="Resident view" title="Your report, at a glance." copy="This is the latest report saved in this browser. It shows the same review trail without exposing staff-only editing controls." />
    <div className="mb-6"><Timeline report={report} /></div>
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className="card p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs text-[#33717c]">{report.id}</p><h2 className="display mt-2 text-3xl text-[#1e4350]" data-testid="text-my-report-issue">{report.issue}</h2><p className="mt-2 text-sm text-[#6a7778]">{formatDate(report.submittedAt, true)} · {report.residentName}</p></div><StatusBadge status={report.status} /></div><div className="mt-7 grid gap-5 border-t border-[#d8dfda] pt-6 sm:grid-cols-2"><div><p className="eyebrow text-[#74817e]">Location</p><p className="mt-2 text-sm leading-6 text-[#415b61]">{report.summaryLocation}</p></div><div><p className="eyebrow text-[#74817e]">Issue type · urgency</p><p className="mt-2 text-sm leading-6 text-[#415b61]">{report.structuredIssueType} <span className="mx-1 text-[#a2afab]">·</span> {report.structuredUrgency}</p></div></div><div className="mt-6 rounded-md bg-[#edf3ef] p-4"><p className="eyebrow text-[#33717c]">Summary</p><p className="mt-2 text-sm leading-6 text-[#435b60]">{report.structuredDescription}</p></div></div>
      <aside className="space-y-5"><div className="card border-[#e4c477] bg-[#fff7df] p-6"><div className="flex gap-3"><Clock3 size={20} className="mt-0.5 shrink-0 text-[#9b6c1c]" /><div><h2 className="font-bold text-[#6f521d]">What happens now?</h2><p className="mt-2 text-sm leading-6 text-[#765e2c]">A City employee would verify the details, decide which department should respond, and determine next steps. AI does not make that decision.</p></div></div></div><div className="card p-6"><p className="eyebrow text-[#33717c]">Information still needed</p><ul className="mt-4 space-y-3 text-sm leading-5 text-[#53676a]">{report.missingInformation.map((item) => <li className="flex gap-2" key={item}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c98945]" />{item}</li>)}</ul></div><Link href="/staff" className="btn btn-ghost w-full no-underline" data-testid="link-my-report-staff">View the staff review demo <ArrowRight size={16} /></Link></aside>
    </div>
  </div>;
}

function Staff() {
  const [reports, setReports] = useState<Report[]>(loadReports);
  const [selectedId, setSelectedId] = useState(reports[0]?.id ?? seedReport.id);
  const [editing, setEditing] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const selected = reports.find((report) => report.id === selectedId) ?? reports[0] ?? seedReport;
  const [draft, setDraft] = useState(selected);
  useEffect(() => { const current = reports.find((report) => report.id === selectedId); if (current) setDraft(current); }, [selectedId, reports]);
  const persist = (next: Report[]) => { setReports(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
  const updateStatus = (status: Status) => { const next = reports.map((report) => report.id === selected.id ? { ...report, status } : report); persist(next); setEditing(false); };
  const saveEdits = () => { persist(reports.map((report) => report.id === selected.id ? { ...draft, humanEdits: 'Edited by Robert' } : report)); setEditing(false); };
  const editField = (key: keyof Report, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const newCount = reports.filter((report) => report.status === 'Human Review' || report.status === 'AI Structured').length;
  return <div className="page-enter shell-width py-8 md:py-12"><div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="eyebrow text-[#33717c]">Staff workspace · Robert</p><span className="badge bg-[#dcecef] text-[#245667]">{newCount} needs review</span></div><h1 className="display mt-2 text-4xl text-[#1e4350] md:text-5xl">AI-Assisted Report Review</h1><p className="mt-3 max-w-2xl leading-7 text-[#617174]">AI organizes reports and identifies missing information. A City employee makes the final decision.</p></div><div className="flex items-center gap-2 text-xs font-semibold text-[#6e7c79]"><span className="h-2 w-2 rounded-full bg-[#4b9b7a]" /> Local demo data only</div></div><div className="mb-6 rounded-md border-l-4 border-[#c98945] bg-[#fff7df] px-4 py-3 text-sm font-bold text-[#6f521d]">Human review required before action.</div><div className="grid gap-5 lg:grid-cols-[330px_1fr]"><section className={`${mobileList ? 'block' : 'hidden'} lg:block`}><div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-[#d8dfda] px-5 py-4"><div><p className="eyebrow text-[#33717c]">Inbox</p><h2 className="mt-1 font-bold text-[#284b55]">Reports</h2></div><span className="font-mono text-xs text-[#71807d]">{reports.length.toString().padStart(2, '0')}</span></div><div className="divide-y divide-[#d8dfda]">{reports.map((report) => <button key={report.id} className={`block w-full border-l-4 p-5 text-left transition-colors hover:bg-[#eef3ee] ${report.id === selected.id ? 'border-[#c98945] bg-[#f3efe3]' : 'border-transparent'}`} onClick={() => { setSelectedId(report.id); setMobileList(false); }} data-testid={`button-report-${report.id}`}><div className="flex items-start justify-between gap-2"><span className="font-mono text-[.68rem] text-[#33717c]">{report.id}</span><span className="text-[.68rem] text-[#778480]">{formatDate(report.submittedAt)}</span></div><p className="mt-2 text-sm font-bold leading-5 text-[#34545b]">{report.issue}</p><p className="mt-1 truncate text-xs text-[#71807d]">{report.summaryLocation}</p><p className="mt-1 text-xs text-[#71807d]">{report.structuredIssueType} · AI urgency: {report.structuredUrgency}</p><div className="mt-3"><StatusBadge status={report.status} /></div></button>)}</div></div></section><section className={`${mobileList ? 'hidden' : 'block'} lg:block`}><button className="btn btn-ghost mb-4 lg:hidden" onClick={() => setMobileList(true)} data-testid="button-show-report-list">← All reports</button><div className="card overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d8dfda] bg-[#f3f1e8] px-5 py-5 md:px-7"><div><p className="font-mono text-xs text-[#33717c]">{selected.id}</p><h2 className="display mt-2 text-3xl text-[#1e4350]">{selected.issue}</h2><p className="mt-2 text-sm text-[#6a7778]">Submitted by {selected.residentName} · {formatDate(selected.submittedAt, true)}</p></div><StatusBadge status={selected.status} /></div><div className="p-5 md:p-7"><div className="mb-7"><Timeline report={selected} compact /></div><div className="mb-7"><ReportReadiness report={selected} /></div><div className="mb-7 flex items-center gap-2 border-b border-[#d8dfda] pb-4"><Sparkles size={16} className="text-[#33717c]" /><p className="eyebrow text-[#33717c]">AI draft · review each field before action</p></div>{editing ? <div className="grid gap-5 md:grid-cols-2"><div className="md:col-span-2"><label className="field-label" htmlFor="edit-issue">Issue</label><input id="edit-issue" className="field-input" value={draft.issue} onChange={(e) => editField('issue', e.target.value)} data-testid="input-edit-issue" /></div><div><label className="field-label" htmlFor="edit-location">Location summary</label><input id="edit-location" className="field-input" value={draft.summaryLocation} onChange={(e) => editField('summaryLocation', e.target.value)} data-testid="input-edit-location" /></div><div><label className="field-label" htmlFor="edit-type">Issue type</label><input id="edit-type" className="field-input" value={draft.structuredIssueType} onChange={(e) => editField('structuredIssueType', e.target.value)} data-testid="input-edit-type" /></div><div><label className="field-label" htmlFor="edit-urgency">Urgency</label><select id="edit-urgency" className="field-input" value={draft.structuredUrgency} onChange={(e) => editField('structuredUrgency', e.target.value)} data-testid="select-edit-urgency"><option>High</option><option>Medium</option><option>Low</option><option>Not sure</option></select></div><div><label className="field-label" htmlFor="edit-department">Suggested department</label><input id="edit-department" className="field-input" value={draft.suggestedDepartment} onChange={(e) => editField('suggestedDepartment', e.target.value)} data-testid="input-edit-department" /></div><div className="md:col-span-2"><label className="field-label" htmlFor="edit-summary">Description / summary</label><textarea id="edit-summary" className="field-input min-h-[110px]" value={draft.structuredDescription} onChange={(e) => editField('structuredDescription', e.target.value)} data-testid="input-edit-summary" /></div><div className="flex gap-2 md:col-span-2"><button className="btn btn-primary" onClick={saveEdits} data-testid="button-save-edits"><Check size={16} /> Save edits</button><button className="btn btn-ghost" onClick={() => { setDraft(selected); setEditing(false); }} data-testid="button-cancel-edits">Cancel</button></div></div> : <div className="grid gap-x-8 gap-y-6 md:grid-cols-2"><InfoField label="Issue" value={selected.issue} /><InfoField label="Location" value={selected.summaryLocation} missing={selected.summaryLocation.toLowerCase().includes('near')} /><InfoField label="Issue type" value={selected.structuredIssueType} /><InfoField label="Urgency" value={selected.structuredUrgency} /><InfoField label="Description / summary" value={selected.structuredDescription} wide /><InfoField label="Previous City Action" value={selected.previousCityAction} /><InfoField label="Suggested department" value={selected.suggestedDepartment} /></div>}<div className="mt-8 rounded-md border border-[#e4c477] bg-[#fff7df] p-5"><div className="flex gap-3"><AlertTriangle size={19} className="mt-0.5 shrink-0 text-[#a16c16]" /><div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-[#6f521d]">Missing information</h3><span className="text-xs font-semibold text-[#8a681f]">{selected.missingInformation.length} items</span></div><p className="mt-1 text-xs leading-5 text-[#83672e]">AI has not inferred these details. Confirm them with the resident before action.</p><ul className="mt-4 space-y-2">{selected.missingInformation.map((item) => <li className="flex items-start gap-2 text-sm text-[#705a2d]" key={item}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c98945]" />{item}</li>)}</ul></div></div></div><div className="mt-7 flex flex-col gap-3 border-t border-[#d8dfda] pt-6 sm:flex-row sm:flex-wrap"><button className="btn btn-ghost" onClick={() => setEditing(true)} data-testid="button-edit-report"><Pencil size={16} /> Edit fields</button><button className="btn btn-ghost border-[#c98945] text-[#81551c]" onClick={() => updateStatus('More Information Requested')} data-testid="button-request-information"><CircleHelp size={16} /> Request more information</button><button className="btn btn-danger sm:ml-auto" onClick={() => updateStatus('Recommendation Rejected')} data-testid="button-reject-report"><X size={16} /> Reject recommendation</button><button className="btn btn-primary" onClick={() => updateStatus('Human Approved')} data-testid="button-approve-report"><Check size={16} /> Approve</button></div></div></div></section></div></div>;
}

function InfoField({ label, value, missing = false, wide = false }: { label: string; value: string; missing?: boolean; wide?: boolean }) {
  return <div className={wide ? 'md:col-span-2' : ''}><p className="eyebrow text-[#75827f]">{label}</p><p className={`mt-2 text-sm leading-6 ${missing ? 'font-semibold text-[#8a631c]' : 'text-[#415b61]'}`}>{value} {missing && <span className="badge ml-1 bg-[#f9e8bb] align-middle text-[#6f4b0c]">needs checking</span>}</p></div>;
}

function NotFound() {
  return <div className="shell-width py-24 text-center"><p className="eyebrow text-[#33717c]">Page not found</p><h1 className="display mt-3 text-5xl text-[#1e4350]">That path is not on the map.</h1><Link href="/" className="btn btn-primary mt-7 no-underline" data-testid="link-back-home">Back to overview</Link></div>;
}

function Router({ onLogout }: { onLogout: () => void }) {
  return <Shell onLogout={onLogout}><Switch><Route path="/" component={Home} /><Route path="/submit" component={Submit} /><Route path="/confirmation" component={Confirmation} /><Route path="/my-report" component={MyReport} /><Route path="/staff" component={Staff} /><Route component={NotFound} /></Switch></Shell>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password === PROTOTYPE_PASSWORD) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      onAuthenticated();
      return;
    }
    setError('Incorrect password. Please try again.');
    setPassword('');
  };

  return <main className="soft-grid flex min-h-[100dvh] items-center justify-center px-5 py-12">
    <div className="page-enter w-full max-w-md">
      <div className="mb-7 flex justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f5362] text-[#f9e4b2] shadow-[0_8px_0_rgba(31,83,98,.13)]"><ShieldCheck size={28} /></span>
      </div>
      <section className="card p-7 md:p-9">
        <div className="text-center">
          <h1 className="display mt-3 text-4xl leading-tight text-[#1e4350]">San José Homelessness Safety Reporter</h1>
          <p className="eyebrow mt-4 text-[#33717c]">Prototype Access</p>
          <p className="mt-4 text-sm leading-6 text-[#617174]">Enter the prototype password to continue to the resident and City staff demo.</p>
        </div>
        <form onSubmit={submit} className="mt-8">
          <label className="field-label" htmlFor="prototype-password">Password</label>
          <input id="prototype-password" type="password" autoComplete="off" autoFocus className="field-input" placeholder="Enter prototype password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} aria-describedby={error ? 'prototype-password-error' : undefined} data-testid="input-prototype-password" />
          {error && <p id="prototype-password-error" className="mt-3 text-sm font-semibold text-[#873d34]" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary mt-6 w-full" data-testid="button-access-prototype">Access Prototype <ArrowRight size={17} /></button>
        </form>
        <div className="mt-7 border-t border-[#d8dfda] pt-5 text-center">
          <PrototypeMark />
        </div>
      </section>
    </div>
  </main>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true');
  const login = () => setAuthenticated(true);
  const logout = () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthenticated(false);
  };

  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>{authenticated ? <Router onLogout={logout} /> : <LoginScreen onAuthenticated={login} />}</WouterRouter>;
}