import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowRight, Check, ChevronDown, ClipboardCheck, FilePlus2, FileText, House, LogOut, MoreVertical, Info, Phone, Repeat, X } from 'lucide-react';
import { clarificationQuestions, departmentDisplay, getReportReadiness, residentStatusLabel, routingHeld, type Report } from '@/lib/report-analysis';
import { getResidentProgress, latestResidentReport, residentNextStepMessage } from '@/lib/resident-experience';
import { ContradictionCheck } from '@/components/contradiction-check';
import { SafetyConcernNotice } from '@/components/safety-concern-notice';
import './resident.css';

export const SEED_ID = 'SJSR-2048';
const fmt = (v: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v));

export function EmergencyNote() {
  return <div className="r-emerg" data-testid="text-emergency-guidance"><Phone size={18} className="shrink-0" aria-hidden="true" /><p style={{ margin: 0 }}><strong>CivicClear does not replace emergency services.</strong> Call 911 if someone is unconscious, seriously injured, or in immediate danger.</p></div>;
}
function ProtoNote() {
  return <p className="r-foot">Class prototype. Not an official City of San José service. Nothing is sent to the City. Reports stay in this browser.</p>;
}

export function ResidentShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const items = [{ href: '/', label: 'Home', Icon: House }, { href: '/submit', label: 'Make a Report', Icon: FilePlus2 }, { href: '/my-report', label: 'My Report', Icon: FileText }];
  return <div className="resident-app">
    <header className="r-top"><div className="r-top-in">
      <Link href="/" className="r-brand" onClick={() => setOpen(false)} data-testid="link-brand"><span className="r-logo"><ClipboardCheck size={18} aria-hidden="true" /></span><span>CIVIC<span style={{ color: '#275db2' }}>CLEAR</span></span></Link>
      <button type="button" className="r-icon-btn" aria-label="Options menu" aria-expanded={open} aria-controls="r-options" onClick={() => setOpen(!open)} onKeyDown={e => e.key === 'Escape' && setOpen(false)} data-testid="button-toggle-navigation">{open ? <X size={20} /> : <MoreVertical size={20} />}</button>
      {open && <div id="r-options" className="r-menu" role="group" aria-label="Options" onKeyDown={e => e.key === 'Escape' && setOpen(false)}>
        <Link href="/staff" onClick={() => setOpen(false)} data-testid="link-switch-demo-view"><Repeat size={18} aria-hidden="true" /><span>Staff Workspace<small>Demo view switch, not access control</small></span></Link>
        <button type="button" onClick={() => { setOpen(false); onLogout(); }} data-testid="button-logout"><LogOut size={18} aria-hidden="true" />Log out</button>
      </div>}
    </div></header>
    <main className="r-main" key={location}>{children}<ProtoNote /></main>
    <nav className="r-nav" aria-label="Resident navigation"><div className="r-nav-in">
      {items.map(({ href, label, Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={location === href || location === '/confirmation' && href === '/my-report' ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={22} aria-hidden="true" />{label}</Link>)}
    </div></nav>
  </div>;
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{value && value.trim() ? value : 'Not provided'}</dd></div>;
}
function Disclosure({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return <details data-testid={testid}><summary>{title}<ChevronDown size={18} aria-hidden="true" /></summary><div>{children}</div></details>;
}

export function ResidentReportView({ report, confirm = false, explain }: { report: Report; confirm?: boolean; explain?: ReactNode }) {
  const progress = getResidentProgress(report);
  const questions = clarificationQuestions(report);
  const readiness = getReportReadiness(report);
  return <div className="page-enter">
    {confirm && <div className="r-hero"><span className="r-logo" style={{ background: '#c9dfff', color: '#194784' }}><Check size={20} aria-hidden="true" /></span>
      <h1>{routingHeld(report) ? 'Report received. We need a few details.' : 'Report received. A person will review it.'}</h1>
      <p>Saved in this browser for the class demo. Nothing was sent to the City.</p></div>}
    <section className="r-card">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
        <div><p className="r-eyebrow" style={{ color: '#194784' }}>Report <span data-testid="text-report-id">{report.id}</span></p>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '6px 0 2px' }} data-testid="text-my-report-issue">{report.issue}</h2>
          <p style={{ margin: 0, fontSize: '.82rem', color: '#566883' }}>Submitted <span data-testid="text-submitted-date">{fmt(report.submittedAt)}</span></p></div>
        <span className="r-pill" data-testid={`status-${report.status.toLowerCase().replaceAll(' ', '-')}`}>{residentStatusLabel(report.status)}</span>
      </div>
    </section>
    <SafetyConcernNotice report={report} />
    <section className="r-card" aria-label="Report progress" data-testid="report-workflow">
      <ol className="r-track">{progress.map((s, i) => <li key={s.label} data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined} data-testid={`workflow-stage-${i + 1}`}>
        <span className="r-dot" aria-hidden="true">{s.state === 'complete' ? <Check size={16} /> : s.state === 'current' ? <span style={{ width: 9, height: 9, borderRadius: 9, background: '#b97a1f' }} /> : null}</span>
        <span>{s.label}<span style={{ display: 'block', fontSize: '.72rem', fontWeight: 600, color: '#566883' }}>{s.state === 'complete' ? 'Complete' : s.state === 'not-performed' ? 'Not performed' : s.state === 'current' ? 'Current' : 'Upcoming'}</span></span></li>)}</ol>
      <p style={{ fontSize: '.8rem', color: '#566883', margin: '8px 0 0', lineHeight: 1.5 }}>AI assists with organizing details. A human reviewer makes any simulated decision.</p>
    </section>
    <section className="r-card" style={{ background: '#fff9eb', borderColor: '#e4c477' }} data-testid="section-next-steps">
      <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>What happens next</h2>
      <p style={{ fontSize: '.88rem', lineHeight: 1.55, margin: '8px 0' }}>{residentNextStepMessage(report)} This prototype does not contact you or any agency.</p>
      {questions.length > 0 && <><p style={{ fontWeight: 800, fontSize: '.82rem', margin: '10px 0 4px' }}>Details still needed</p><ul style={{ margin: 0, paddingLeft: 18, fontSize: '.88rem', lineHeight: 1.55 }}>{questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>}
    </section>
    <Disclosure title="Your original report" testid="details-original"><dl>
      <Row label="Description" value={report.description} /><Row label="Location you gave" value={report.location} /><Row label="Issue type" value={report.issueType} /><Row label="Urgency you chose" value={report.urgency} />
      <Row label="When observed" value={report.sourceObservedAt} /><Row label="Danger you indicated" value={report.sourceDanger} /><Row label="Department mentioned" value={report.requestedDepartment} /></dl></Disclosure>
    <Disclosure title="Draft details (needs reviewer check)" testid="details-draft"><dl>
      <Row label="Issue" value={report.issue} /><Row label="Location" value={report.summaryLocation} /><Row label="Issue type" value={report.structuredIssueType} /><Row label="Urgency" value={report.structuredUrgency} /><Row label="Description" value={report.structuredDescription} /><Row label="Date / time observed" value={report.observedAt} /><Row label="Danger / safety" value={report.danger} /><Row label="Previous City action" value={report.previousCityAction} /><Row label="Department routing" value={departmentDisplay(report)} /></dl></Disclosure>
    {report.analysis && <Disclosure title="Report readiness" testid="report-readiness"><p style={{ margin: '0 0 8px', fontSize: '.88rem' }}>Readiness <strong data-testid="text-readiness-score">{readiness.score}%</strong> · {readiness.held ? 'clarification required, routing held' : 'ready for human review'}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '.88rem', display: 'grid', gap: 6 }}>{readiness.found.map(f => <li key={f.label} style={{ display: 'flex', gap: 8 }}>{f.complete ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}{f.label}</li>)}</ul>
      <p style={{ fontSize: '.75rem', color: '#566883', marginTop: 10 }}>Readiness reflects clarified critical information. It is not a safety rating.</p></Disclosure>}
    <Disclosure title="Contradiction and evidence check" testid="details-evidence"><div className="contradiction-wrap" style={{ padding: 0 }}><ContradictionCheck report={report} /></div></Disclosure>
    {explain && <Disclosure title="How your words became a draft (Why?)" testid="details-explain">{explain}</Disclosure>}
    <EmergencyNote />
    <div className="r-actions"><Link href="/submit" className="r-btn r-btn-ghost" data-testid="link-start-report">New report</Link>{confirm && <Link href="/my-report" className="r-btn r-btn-solid" data-testid="link-view-my-report">My Report <ArrowRight size={16} /></Link>}</div>
  </div>;
}

export function ResidentHome({ load }: { load: () => Report[] }) {
  const report = latestResidentReport(load(), SEED_ID);
  return <div className="page-enter">
    <div className="r-hero"><p className="r-eyebrow">San José resident reporting</p><h1>Describe a safety concern in your own words.</h1>
      <p>Tell us what you noticed. Unclear details stay visible, and a person reviews before any simulated decision.</p>
      <div style={{ marginTop: 18 }}><Link href="/submit" className="r-btn r-btn-pri" data-testid="link-start-report">Make a Report <ArrowRight size={18} /></Link></div></div>
    <EmergencyNote />
    {report ? <section className="r-card" data-testid="card-latest-report"><p className="r-eyebrow" style={{ color: '#194784' }}>Your latest report in this browser</p>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '8px 0 4px' }}>{report.issue}</h2>
      <p style={{ fontSize: '.82rem', color: '#566883', margin: '0 0 12px' }}>{report.id} · {fmt(report.submittedAt)}</p>
      <span className="r-pill">{residentStatusLabel(report.status)}</span>
      <div style={{ marginTop: 14 }}><Link href="/my-report" className="r-btn r-btn-solid" style={{ width: '100%' }} data-testid="link-track-report">Track this report <ArrowRight size={16} /></Link></div></section>
    : <section className="r-card" data-testid="empty-home"><h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>No report yet</h2><p style={{ fontSize: '.9rem', lineHeight: 1.55, color: '#566883', margin: '8px 0 0' }}>You have not submitted a report in this browser. When you do, you can track it here.</p></section>}
    <section className="r-card"><h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Info size={18} aria-hidden="true" />How it works</h2>
      <p style={{ fontSize: '.88rem', lineHeight: 1.6, color: '#566883', margin: '8px 0 0' }}>Answer a few short steps, review what you entered, then submit. AI organizes your words and flags missing details. Report text is sent to OpenAI for analysis; nothing goes to the City.</p></section>
  </div>;
}

export function ResidentMyReport({ load, explain }: { load: () => Report[]; explain?: (r: Report) => ReactNode }) {
  const report = latestResidentReport(load(), SEED_ID);
  if (!report) return <div className="page-enter"><section className="r-card" data-testid="empty-my-report"><h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>No report to show yet</h1><p style={{ fontSize: '.9rem', lineHeight: 1.55, color: '#566883', margin: '8px 0 14px' }}>No report has been submitted in this browser. Reports are stored locally, not in an account.</p><Link href="/submit" className="r-btn r-btn-solid" data-testid="link-start-report">Make a Report <ArrowRight size={16} /></Link></section><EmergencyNote /></div>;
  return <ResidentReportView report={report} explain={explain?.(report)} />;
}

export function ResidentConfirmation({ load, explain }: { load: () => Report[]; explain?: (r: Report) => ReactNode }) {
  const report = latestResidentReport(load(), SEED_ID);
  if (!report) return <ResidentMyReport load={load} />;
  return <ResidentReportView report={report} confirm explain={explain?.(report)} />;
}
