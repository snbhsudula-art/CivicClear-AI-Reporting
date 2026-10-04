import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  AlertTriangle, ArrowRight, Check, ChevronRight, Clock3, FileText,
  Info, MapPin, Menu, Paperclip, Pencil, Sparkles, Trash2,
  UserRound, X, CircleHelp,
} from 'lucide-react';
import { getReportReadiness, departmentDisplay, clarificationQuestions, routingHeld, residentStatusLabel, type Report, type Status } from '@/lib/report-analysis';
import { ContradictionCheck } from '@/components/contradiction-check';
import { ResidentSubmit } from '@/components/resident-submit';
import { ResidentShell, ResidentHome, ResidentMyReport, ResidentConfirmation } from '@/components/resident-app';
import { StaffReview } from '@/components/staff-review';
import { SafetyConcernNotice } from '@/components/safety-concern-notice';
import { CivicClearLogo } from '@/components/civicclear-logo';

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
  return <span className={`badge ${tone}`} data-testid={`status-${status.toLowerCase().replaceAll(' ', '-')}`}>{residentStatusLabel(status)}</span>;
}

function isUsable(value: string, allowOther = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'unknown' || normalized === 'not sure') return false;
  if (!allowOther && normalized === 'other') return false;
  return true;
}

function ReportReadiness({ report }: { report: Report }) {
  const readiness = getReportReadiness(report);
  return <><SafetyConcernNotice report={report} /><section className="card overflow-hidden border-[#7da9a7] bg-[#e3efeb]" data-testid="report-readiness">
    <div className="flex flex-col gap-5 border-b border-[#bfd6d0] bg-[#d6e9e3] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-7">
      <div>
        <p className="eyebrow text-[#33717c]">AI-generated assessment</p>
        <h2 className="mt-2 text-xl font-bold uppercase tracking-[.08em] text-[#1f5362]">REPORT READINESS</h2>
      </div>
      <div className="flex items-end gap-3">
        <span className="font-mono text-4xl font-medium leading-none text-[#1f5362]" data-testid="text-readiness-score">{readiness.score}%</span>
        <span className="pb-1 text-xs font-semibold text-[#52716f]">{readiness.held ? 'clarification required · routing held' : 'information ready for human review'}</span>
      </div>
    </div>
    <div className="px-5 py-5 md:px-7">
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-[#bdd3cc]"><div className="h-full rounded-full bg-[#33717c] transition-all" style={{ width: `${readiness.score}%` }} /></div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow text-[#33717c]">AI found</p>
          <ul className="mt-3 space-y-2">{readiness.found.map((item) => <li key={item.label} className={`flex items-start gap-2 text-sm ${item.complete ? 'text-[#2d5e58]' : 'text-[#806b3a]'}`}><span className="mt-0.5">{item.complete ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}</span><span>{item.label}</span></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow text-[#8a681f]">Missing information</p>
          <ul className="mt-3 space-y-2">{readiness.missing.length > 0 ? readiness.missing.map((item) => <li key={item} className="flex items-start gap-2 text-sm text-[#705a2d]"><AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{item}</span></li>) : <li className="text-sm text-[#2d5e58]">No key fields are missing.</li>}</ul>
        </div>
      </div>
      <p className="mt-6 border-t border-[#bfd6d0] pt-4 text-xs leading-5 text-[#52716f]">Readiness measures clarified critical information, not merely filled fields. Unresolved conflicts or missing critical details cap the score below 50%. It is not a safety rating or permission to route; a human must make the final decision.</p>
    </div>
  </section></>;
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
  const missingItems = clarificationQuestions(report).filter((item) => isUsable(item));
  return <section className="mt-8" data-testid="before-after-ai">
    <div className="mb-5">
      <p className="eyebrow text-[#33717c]">Transformation view</p>
      <h2 className="display mt-2 text-3xl text-[#1e4350]">Your Report Summary</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617174]">See how the resident’s own words become a structured draft without filling in facts that were not provided.</p>
    </div>
    <div className="grid items-stretch gap-4 md:grid-cols-[1fr_120px_1fr]">
      <article className="card flex flex-col border-[#d5c9b7] bg-[#fbf7ef] p-5 md:p-6">
        <p className="eyebrow text-[#8a681f]">Unstructured report</p>
        <h3 className="mt-2 text-lg font-bold text-[#284b55]">What You Reported</h3>
        <blockquote className="mt-5 flex-1 border-l-2 border-[#c98945] pl-4 text-sm leading-7 text-[#4f6265]">“{report.description.trim() ? report.description : 'Missing'}”</blockquote>
      </article>
      <div className="flex items-center justify-center gap-2 py-1 text-center md:flex-col md:py-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dcecef] text-[#1f5362]"><ArrowRight className="rotate-90 md:rotate-0" size={19} /></span>
        <span className="eyebrow max-w-[110px] text-[#33717c]">Draft summary</span>
      </div>
      <article className="card border-[#7da9a7] bg-[#edf3ef] p-5 md:p-6">
        <p className="eyebrow text-[#33717c]">Draft summary</p>
        <p className="mt-2 text-xs font-semibold text-[#52716f]">AI-generated summary — a reviewer must check it</p>
        <h3 className="mt-2 text-lg font-bold text-[#284b55]">Report Details</h3>
        <div className="mt-5 grid gap-4">
          <ExplainableField label="Issue" value={displayExtractedValue(report.issue)} name="issue" explanation={fieldExplanation(report, 'issue')} />
          <ExplainableField label="Location" value={displayExtractedValue(report.summaryLocation)} name="location" explanation={fieldExplanation(report, 'location')} />
          <ExplainableField label="Issue Type" value={displayExtractedValue(report.structuredIssueType)} name="type" explanation={fieldExplanation(report, 'type')} />
          <ExplainableField label="Urgency" value={displayExtractedValue(report.structuredUrgency)} name="urgency" explanation={fieldExplanation(report, 'urgency')} />
          <InfoField label="Description" value={displayExtractedValue(report.structuredDescription)} wide />
          <InfoField label="Previous City Action" value={displayExtractedValue(report.previousCityAction)} />
          <InfoField label="Date / time observed" value={report.observedAt || 'Missing — clarification required'} />
          <InfoField label="Danger / safety" value={report.danger || 'Missing — clarification required'} />
          <InfoField label="Department routing" value={departmentDisplay(report)} wide />
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
  return <div className={`flex items-center gap-2 text-[.68rem] font-semibold ${dark ? 'text-[#d6e6e5]' : 'text-[#52666c]'}`}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#dcecef] text-[#1c3f4a]"><Info size={12} strokeWidth={2.5} /></span><span>Class Prototype — Not an Official City of San José Service</span></div>;
}

function Header({ onLogout }: { onLogout: () => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const staff = location === '/staff' || location.startsWith('/staff/');
  const nav = staff
    ? [{ href: '/staff', label: 'Review Inbox' }]
    : [{ href: '/', label: 'Overview' }, { href: '/submit', label: 'Make a Report' }, { href: '/my-report', label: 'My Report' }];
  return <header className="sticky top-0 z-10 border-b border-[#cfd8d5] bg-[#f8f3e8]/95 backdrop-blur">
    <div className="shell-width flex min-h-[70px] items-center justify-between gap-4">
      <Link href={staff ? '/staff' : '/'} className="flex items-center gap-3 no-underline" onClick={() => setOpen(false)} data-testid="link-brand">
        <span><CivicClearLogo size={28} /><span className="mt-1 block text-[.67rem] text-[#6a7778]">{staff ? 'Staff / reviewer workspace' : 'Resident reporting'} · class prototype</span></span>
      </Link>
      <button className="btn btn-ghost btn-sm md:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation" data-testid="button-toggle-navigation">{open ? <X size={17} /> : <Menu size={17} />}</button>
      <nav className={`${open ? 'absolute left-3 right-3 top-[65px] flex' : 'hidden'} card flex-col gap-1 p-2 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`} aria-label={staff ? 'Staff navigation' : 'Resident navigation'}>
        {nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`rounded-md px-3 py-2 text-sm font-semibold no-underline transition-colors ${location === item.href ? 'bg-[#dcecef] text-[#1f5362]' : 'text-[#556569] hover:bg-[#ece8dd] hover:text-[#1f5362]'}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>{item.label}</Link>)}
        <Link href={staff ? '/' : '/staff'} onClick={() => setOpen(false)} className="rounded-md border border-[#cfd8d5] px-3 py-2 text-xs font-semibold text-[#556569] no-underline hover:bg-[#ece8dd] md:ml-2" data-testid="link-switch-demo-view">{staff ? 'Resident View' : 'Staff Workspace'} <span className="font-normal">· demo</span></Link>
        <button type="button" onClick={() => { setOpen(false); onLogout(); }} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-[#7d4b3f] transition-colors hover:bg-[#f3d9d4] md:text-center" data-testid="button-logout">Log out</button>
      </nav>
    </div>
    {staff && <div className="border-t border-[#cfd8d5] bg-[#e3efeb]"><p className="shell-width py-2 text-xs leading-5 text-[#52666c]">Staff / reviewer workspace · review reports and record human decisions. Demo view switching is not access control.</p></div>}
  </header>;
}

function Footer() {
  return <footer className="mt-16 border-t border-[#cfd8d5] bg-[#e7eee9]"><div className="shell-width flex flex-col gap-4 py-8 text-sm text-[#52666c] md:flex-row md:items-center md:justify-between"><div><CivicClearLogo size={24} /><div className="mt-2"><PrototypeMark /></div></div><p className="max-w-xl text-xs leading-5">Turn unclear reports into actionable information. Report text is sent to OpenAI for analysis; records stay in this browser. Nothing is sent to the City of San José. AI drafts require human review and clarification before routing.</p></div></footer>;
}

function Shell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [path] = useLocation();
  if (!(path === '/staff' || path.startsWith('/staff/'))) return <ResidentShell onLogout={onLogout}>{children}</ResidentShell>;
  return <div className="app-shell noise"><Header onLogout={onLogout} /><main>{children}</main><Footer /></div>;
}

function Home() {
  return <div className="page-enter">
    <section className="soft-grid overflow-hidden border-b border-[#cfd8d5]">
      <div className="shell-width grid gap-12 py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-24">
        <div><PrototypeMark /><p className="eyebrow mt-9 text-[#33717c]">CIVICCLEAR / resident reporting demo</p><h1 className="display mt-4 max-w-[680px] text-5xl leading-[1.06] text-[#1e4350] md:text-7xl">Turn unclear reports into <span className="text-[#33717c]">actionable information.</span></h1><p className="prose-copy mt-7 text-lg text-[#56676a]">CivicClear is a class prototype that helps San José residents describe local safety concerns clearly. Share what you observed, track your report, and see which details a reviewer still needs.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/submit" className="btn btn-primary no-underline" data-testid="link-start-report">Make a Report <ArrowRight size={17} /></Link><Link href="/my-report" className="btn btn-ghost no-underline" data-testid="link-track-report">My Report <ChevronRight size={17} /></Link></div><div className="mt-7 flex items-center gap-2 text-xs font-semibold text-[#6b7674]"><Info size={15} className="text-[#33717c]" /> AI assists. A person reviews. No report is sent to the City.</div></div>
        <div className="relative"><div className="absolute -right-8 -top-9 h-28 w-28 rounded-full border-[18px] border-[#f2bb67]/60" /><div className="card relative mx-auto max-w-[430px] overflow-hidden border-[#a9c5c3] bg-[#f5f4ec]"><div className="flex items-center justify-between border-b border-[#d2dcd6] bg-[#e3efeb] px-5 py-4"><span className="eyebrow text-[#33717c]">Illustrative report preview</span><span className="badge bg-[#f9e8bb] text-[#6f4b0c]"><Sparkles size={12} /> AI draft</span></div><div className="p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d4e7e4] text-[#1f5362]"><AlertTriangle size={18} /></span><div><p className="text-xs font-semibold text-[#73807d]">ISSUE</p><p className="font-bold text-[#284b55]">Blocked sidewalk access</p></div></div><div className="my-6 space-y-4"><div><p className="eyebrow text-[#78817c]">Resident observation</p><p className="mt-1 text-sm leading-6 text-[#42595e]">Trash and broken items may be affecting wheelchair and pedestrian access.</p></div><div className="rounded-md border border-[#e4bb67] bg-[#fff6dc] p-3"><p className="eyebrow text-[#8b651d]">Clarification first</p><p className="mt-1 text-sm font-semibold text-[#75591f]">Check conflicts · confirm critical details</p></div></div><div className="flex items-center justify-between border-t border-[#d2dcd6] pt-4 text-xs text-[#6d7b78]"><span>Routing held until clarified</span><span className="flex items-center gap-1"><Clock3 size={13} /> human review</span></div></div></div></div>
      </div>
    </section>
    <section className="shell-width grid gap-5 py-16 md:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow text-[#33717c]">How this demo works</p><h2 className="display mt-3 text-4xl text-[#1e4350]">Information, not assumptions.</h2><p className="mt-4 max-w-md leading-7 text-[#5b6a6d]">The experience keeps unknowns visible. AI can organize a resident’s words, but it cannot fill gaps or make a real-world decision.</p></div><div className="grid gap-4 sm:grid-cols-3">{[['01','Describe','Share the situation in your own words.'],['02','Structure','The prototype separates facts from missing details.'],['03','Review','A demo human reviewer inspects the draft.']].map(([number,title,copy]) => <div className="card p-5" key={number}><span className="font-mono text-sm text-[#b86e40]">{number}</span><h3 className="mt-8 font-bold text-[#284b55]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#687674]">{copy}</p></div>)}</div></section>
    <section className="bg-[#1f5362] text-[#f7f2e7]"><div className="shell-width flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between"><div><p className="eyebrow text-[#b8d9d5]">Track your report</p><h2 className="display mt-2 text-3xl">See the status and next steps.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#d2e3df]">My Report shows your latest report in this browser, what is still unclear, and whether a reviewer has recorded a decision. This demo does not send reports to the City.</p></div><Link href="/my-report" className="btn btn-secondary self-start no-underline" data-testid="link-see-report">View My Report <ArrowRight size={16} /></Link></div></section>
  </div>;
}

function StepHeader({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="mb-8"><p className="eyebrow text-[#33717c]">{eyebrow}</p><h1 className="display mt-2 text-4xl leading-tight text-[#1e4350] md:text-5xl">{title}</h1><p className="mt-3 max-w-2xl leading-7 text-[#617174]">{copy}</p></div>;
}

function Submit() {
  return <ResidentSubmit sample={seedReport} onSave={report => {
    const current = loadReports();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([report, ...current]));
  }} />;
}

function WorkflowTracker({ report, staff = false }: { report: Report; staff?: boolean }) {
  const stages = staff
    ? ['Resident Report', 'Contradiction & Missing Information Check', 'AI Draft', 'Human Review', 'Human Decision']
    : ['Report Received', 'Checking Report Details', 'In Progress', 'Under Review', 'Reviewer Decision'];
  const decided = report.status === 'Human Approved' || report.status === 'Recommendation Rejected';
  return <section className="card border-[#a9c5c3] bg-[#f3f7f3] p-5 md:p-6" aria-label="Report workflow" data-testid="report-workflow">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <div><p className="eyebrow text-[#33717c]">{staff ? 'Report workflow' : 'Your Report'}</p><h2 className="mt-1 text-lg font-bold text-[#1f5362]">{staff ? 'From report to human decision' : 'What happens next'}</h2></div>
      <span className="rounded-full bg-[#e0eae5] px-3 py-1 text-xs font-semibold text-[#2a5c5d]">{decided ? 'Decision recorded' : report.status === 'More Information Requested' ? 'More information needed' : staff ? 'Awaiting human decision' : 'Waiting for reviewer decision'}</span>
    </div>
    <ol className="grid gap-5 lg:grid-cols-5 lg:gap-2">
      {stages.map((stage, index) => {
        const completed = index === 4 ? decided : index === 3 ? decided : index === 0 || Boolean(report.analysis) && index < 3;
        const current = !decided && index === (report.analysis ? 3 : 1);
        const state = completed ? 'Complete' : current ? 'Current' : decided ? 'Not performed' : 'Upcoming';
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

function LegacyTimeline({ report, compact = false, staff = false }: { report: Report; compact?: boolean; staff?: boolean }) {
  const steps = ['Report Submitted', staff ? 'AI Draft' : 'In Progress', staff ? 'Human Review' : 'Under Review', 'Decision'];
  const complete = report.status === 'Human Approved' || report.status === 'Recommendation Rejected' ? 4 : report.status === 'More Information Requested' ? 3 : report.status === 'Human Review' ? 3 : report.status === 'AI Structured' ? 2 : 1;
  return <div className={`${compact ? '' : 'card p-5 md:p-7'}`}><div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-[#284b55]">Report timeline</h2><span className="text-xs font-semibold text-[#71807d]">{complete} of 4 steps</span></div><div className={`${compact ? 'grid gap-3' : 'grid gap-5 sm:grid-cols-4'}`}>{steps.map((step, index) => { const done = index < complete; const active = index === complete - 1; return <div key={step} className={`relative ${!compact && index < 3 ? 'after:hidden after:absolute after:left-[calc(50%+23px)] after:right-[calc(-50%+23px)] after:top-4 after:h-px after:bg-[#c5d6d1] sm:after:block' : ''}`}><div className={`relative z-[1] flex items-center gap-3 ${!compact ? 'sm:flex-col sm:text-center' : ''}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-[#33717c] bg-[#33717c] text-[#f8f3e8]' : 'border-[#bdccc7] bg-[#f8f3e8] text-[#8b9995]'}`}>{done ? <Check size={15} /> : <span className="text-xs">{index + 1}</span>}</span><span className={`${active ? 'font-bold text-[#1f5362]' : done ? 'font-semibold text-[#536a6d]' : 'text-[#8b9894]'} text-sm`}>{step}</span></div></div>; })}</div>{report.status === 'More Information Requested' && <p className="mt-5 border-t border-[#d8dfda] pt-4 text-xs font-semibold text-[#8a631c]">Waiting for more information from the resident.</p>}{report.status === 'Recommendation Rejected' && <p className="mt-5 border-t border-[#d8dfda] pt-4 text-xs font-semibold text-[#873d34]">The recommendation was rejected by a human reviewer.</p>}</div>;
}

function Timeline({ report, compact = false, staff = false }: { report: Report; compact?: boolean; staff?: boolean }) {
  return <div className="space-y-5"><WorkflowTracker report={report} staff={staff} /><LegacyTimeline report={report} compact={compact} staff={staff} /></div>;
}

function Confirmation() {
  const report = loadReports()[0] ?? seedReport;
  return <div className="page-enter shell-width py-12 md:py-16"><div className="mx-auto max-w-3xl">
    <div className="card overflow-hidden">
      <div className="bg-[#1f5362] px-6 py-10 text-[#f7f2e7] md:px-10"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9dd2c2] text-[#1f5362]"><Check size={25} strokeWidth={2.5} /></div><p className="eyebrow mt-7 text-[#b9d9d5]">Report received in this prototype</p><h1 className="display mt-2 text-4xl md:text-5xl">{routingHeld(report) ? 'Your report needs clarification.' : 'Your draft is ready for human review.'}</h1><p className="mt-4 max-w-lg leading-7 text-[#d8e8e3]">Thank you, {report.residentName.split(' ')[0]}. The AI check is shown below, alongside preserved statements and clarification questions. Nothing has been routed or sent to the City.</p></div>
      <div className="p-6 md:p-10">
        <div className="grid gap-4 sm:grid-cols-3"><div><p className="eyebrow text-[#73817d]">Report ID</p><p className="mt-2 font-mono text-sm font-semibold text-[#1f5362]" data-testid="text-report-id">{report.id}</p></div><div><p className="eyebrow text-[#73817d]">Submitted</p><p className="mt-2 text-sm font-semibold text-[#304f56]" data-testid="text-submitted-date">{formatDate(report.submittedAt, true)}</p></div><div><p className="eyebrow text-[#73817d]">Status</p><div className="mt-2"><StatusBadge status={report.status} /></div></div></div>
        <div className="my-8 divider" />
        <div className="mb-8"><Timeline report={report} /></div>
        <ReportReadiness report={report} />
        <ContradictionCheck report={report} />
        <BeforeAfterAI report={report} />
        <div className="mt-8 rounded-md border border-[#a9c5c3] bg-[#edf3ef] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="eyebrow text-[#33717c]">Your Report Summary</p><span className="badge bg-[#dcecef] text-[#245667]">Needs reviewer check</span></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><InfoField label="Issue" value={report.issue} /><InfoField label="Location" value={report.summaryLocation} /><InfoField label="Issue type" value={report.structuredIssueType} /><InfoField label="Urgency" value={report.structuredUrgency} /><InfoField label="Description" value={report.structuredDescription} wide /><InfoField label="Date / time observed" value={report.observedAt || 'Missing — clarification required'} /><InfoField label="Danger / safety" value={report.danger || 'Missing — clarification required'} /><InfoField label="Previous City Action" value={report.previousCityAction} /></div><div className="mt-5 border-t border-[#cbded8] pt-4"><p className="eyebrow text-[#8a681f]">Clarification needed</p><ul className="mt-2 space-y-1 text-sm leading-6 text-[#705a2d]">{clarificationQuestions(report).map((item, i) => <li key={i}>• {item}</li>)}</ul><p className="mt-4 text-sm font-semibold text-[#425c60]">Department routing: {departmentDisplay(report)}</p></div></div>
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
    <ReportReadiness report={report} />
    <ContradictionCheck report={report} />
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className="card p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs text-[#33717c]">{report.id}</p><h2 className="display mt-2 text-3xl text-[#1e4350]" data-testid="text-my-report-issue">{report.issue}</h2><p className="mt-2 text-sm text-[#6a7778]">{formatDate(report.submittedAt, true)} · {report.residentName}</p></div><StatusBadge status={report.status} /></div><div className="mt-7 grid gap-5 border-t border-[#d8dfda] pt-6 sm:grid-cols-2"><div><p className="eyebrow text-[#74817e]">Location</p><p className="mt-2 text-sm leading-6 text-[#415b61]">{report.summaryLocation}</p></div><div><p className="eyebrow text-[#74817e]">Issue type · urgency</p><p className="mt-2 text-sm leading-6 text-[#415b61]">{report.structuredIssueType} <span className="mx-1 text-[#a2afab]">·</span> {report.structuredUrgency}</p></div></div><div className="mt-6 rounded-md bg-[#edf3ef] p-4"><p className="eyebrow text-[#33717c]">Summary</p><p className="mt-2 text-sm leading-6 text-[#435b60]">{report.structuredDescription}</p></div></div>
      <aside className="space-y-5"><div className="card border-[#e4c477] bg-[#fff7df] p-6"><div className="flex gap-3"><Clock3 size={20} className="mt-0.5 shrink-0 text-[#9b6c1c]" /><div><h2 className="font-bold text-[#6f521d]">What happens now?</h2><p className="mt-2 text-sm leading-6 text-[#765e2c]">In the demo, a human reviewer checks the details, considers the suggested department, and records a simulated next step. AI does not make that decision. No real agency receives this report.</p></div></div></div><div className="card p-6"><p className="eyebrow text-[#33717c]">Information still needed</p><ul className="mt-4 space-y-3 text-sm leading-5 text-[#53676a]">{report.missingInformation.map((item) => <li className="flex gap-2" key={item}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c98945]" />{item}</li>)}</ul></div><Link href="/staff" className="btn btn-ghost w-full no-underline" data-testid="link-my-report-staff">View the staff review demo <ArrowRight size={16} /></Link></aside>
    </div>
  </div>;
}

function Staff() {
  return <StaffReview load={loadReports} storageKey={STORAGE_KEY} timeline={report => <Timeline report={report} compact staff />} readiness={report => <ReportReadiness report={report} />} />;
}

function InfoField({ label, value, missing = false, wide = false }: { label: string; value: string; missing?: boolean; wide?: boolean }) {
  return <div className={wide ? 'md:col-span-2' : ''}><p className="eyebrow text-[#75827f]">{label}</p><p className={`mt-2 text-sm leading-6 ${missing ? 'font-semibold text-[#8a631c]' : 'text-[#415b61]'}`}>{value} {missing && <span className="badge ml-1 bg-[#f9e8bb] align-middle text-[#6f4b0c]">needs checking</span>}</p></div>;
}

function NotFound() {
  return <div className="shell-width py-24 text-center"><p className="eyebrow text-[#33717c]">Page not found</p><h1 className="display mt-3 text-5xl text-[#1e4350]">That path is not on the map.</h1><Link href="/" className="btn btn-primary mt-7 no-underline" data-testid="link-back-home">Back to overview</Link></div>;
}

function Router({ onLogout }: { onLogout: () => void }) {
  return <Shell onLogout={onLogout}><Switch><Route path="/">{() => <ResidentHome load={loadReports} />}</Route><Route path="/submit" component={Submit} /><Route path="/confirmation">{() => <ResidentConfirmation load={loadReports} explain={r => <BeforeAfterAI report={r} />} />}</Route><Route path="/my-report">{() => <ResidentMyReport load={loadReports} explain={r => <BeforeAfterAI report={r} />} />}</Route><Route path="/staff" component={Staff} /><Route component={NotFound} /></Switch></Shell>;
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
        <CivicClearLogo size={56} iconOnly />
      </div>
      <section className="card p-7 md:p-9">
        <div className="text-center">
          <p className="eyebrow text-[#33717c]">Resident reporting · class prototype</p>
          <h1 className="display mt-3 text-4xl leading-tight text-[#1e4350] sm:text-5xl">CivicClear</h1>
          <p className="mt-3 text-sm font-semibold text-[#33717c]">Turn unclear reports into actionable information.</p>
          <p className="mt-4 text-sm leading-6 text-[#617174]">Enter the prototype password to explore the resident report and human review demo. This is not an official city service.</p>
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