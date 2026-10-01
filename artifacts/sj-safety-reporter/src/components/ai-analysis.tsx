import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle, BookOpenText, Bot, ChevronDown, ClipboardList, Building2, Search, ShieldAlert, ShieldCheck, ListChecks, Siren, Info,
} from 'lucide-react';
import { buildAIAnalysis } from '@/lib/ai-analysis';
import type { Report } from '@/lib/report-analysis';

const tone = (status: string) => {
  const s = status.toLowerCase();
  if (/(uncertain|clarif|missing|review required|conflict|held)/.test(s)) return 'bg-amber-100 text-amber-950';
  if (/(detected|consistent|clear|reviewed|resolved|verified)/.test(s)) return 'bg-blue-100 text-blue-900';
  return 'bg-slate-100 text-slate-800';
};
function Pill({ children, testId }: { children: ReactNode; testId?: string }) {
  return <span className={`badge ${tone(String(children))}`} data-testid={testId}>{children}</span>;
}
function Section({ id, icon, title, children, open }: { id: string; icon: ReactNode; title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className="group rounded-xl border border-slate-200 bg-white" data-testid={`section-ai-${id}`}>
    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
      <span className="text-blue-800" aria-hidden="true">{icon}</span><span className="flex-1">{title}</span>
      <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-slate-100 p-4 text-sm leading-6 text-slate-700">{children}</div>
  </details>;
}
function Quotes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="mt-2 space-y-1">{items.map((q, i) => <li key={i}><blockquote className="border-l-2 border-blue-300 pl-3 text-xs italic text-slate-700">“{q}”</blockquote></li>)}</ul>;
}

export function AIAnalysis({ report }: { report: Report }) {
  const a = useMemo(() => buildAIAnalysis(report), [report]);
  const limitations = <>
    <p data-testid="text-ai-limitations-statement" className="font-semibold">CivicClear analyzes information provided by the resident. It does not independently verify reported conditions or make the final City decision.</p>
    <p className="mt-2">AI recommendations are drafts for human review.</p>
  </>;
  const emergency = <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-900" data-testid="text-ai-emergency-guidance"><Siren size={16} className="mt-0.5 shrink-0" aria-hidden="true" />CivicClear does not replace emergency services. Call 911 if someone is unconscious, seriously injured, or in immediate danger.</p>;

  if (!a.available) {
    return <section className="mb-7 min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-5 [overflow-wrap:anywhere]" aria-labelledby="ai-analysis-title" data-testid="card-ai-analysis">
      <h3 id="ai-analysis-title" className="flex items-center gap-2 font-bold text-slate-900"><Bot size={18} aria-hidden="true" />AI Analysis</h3>
      <div data-testid="section-ai-overall"><p className="mt-3 font-semibold text-slate-800" data-testid="text-ai-unavailable">AI analysis not yet available</p>
        <p className="mt-1 text-sm text-slate-700">Run the AI contradiction check before routing or approval. No findings are shown until it completes.</p></div>
      <div className="mt-4 space-y-3" data-testid="section-ai-limitations">{emergency}<div className="text-sm text-slate-700">{limitations}</div></div>
    </section>;
  }

  return <section className="mb-7 min-w-0 rounded-xl border border-blue-200 bg-blue-50/40 p-4 md:p-5 [overflow-wrap:anywhere]" aria-labelledby="ai-analysis-title" data-testid="card-ai-analysis">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="ai-analysis-title" className="flex items-center gap-2 font-bold text-slate-900"><Bot size={18} aria-hidden="true" />AI Analysis <span className="eyebrow text-slate-600">Draft · staff only</span></h3>
      {a.held && <Pill testId="status-ai-held">Human Review Required</Pill>}
    </div>
    <div className="mt-4 rounded-xl bg-white p-4" data-testid="section-ai-overall">
      <p className="eyebrow text-blue-800">Overall assessment</p>
      <p className="mt-2 text-sm leading-6 text-slate-800" data-testid="text-ai-overall">{a.overall}</p>
    </div>

    {a.hazard.possible && <div className="mt-3 rounded-xl border-l-4 border-red-700 bg-red-50 p-4" role="alert" data-testid="alert-ai-hazard">
      <p className="flex items-center gap-2 font-bold text-red-950"><ShieldAlert size={16} aria-hidden="true" />Possible hazard · {a.hazard.urgency}{a.hazard.reviewed ? ' · reviewed, preserved' : ''}</p>
      <p className="mt-1 text-sm text-red-950">{a.hazard.explanation}</p><Quotes items={a.hazard.evidence} />
    </div>}
    {a.contradictions.some(c => c.status !== 'Human Review Recorded') && <div className="mt-3 rounded-xl border-l-4 border-amber-600 bg-amber-50 p-4" role="alert" data-testid="alert-ai-uncertainty">
      <p className="flex items-center gap-2 font-bold text-amber-950"><AlertTriangle size={16} aria-hidden="true" />AI Uncertainty Detected</p>
      <p className="mt-1 text-sm text-amber-950">Conflicting or uncertain details are preserved below. Fields needing clarification: {a.contradictions.filter(c => c.status !== 'Human Review Recorded').map(c => c.field).join(', ')}.</p>
    </div>}
    <div className="mt-3">{emergency}</div>
    <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-700" data-testid="text-ai-limitations-summary"><Info size={14} className="mr-1 inline" aria-hidden="true" />CivicClear analyzes information provided by the resident. It does not independently verify reported conditions or make the final City decision. Drafts for human review.</div>

    <div className="mt-4 space-y-3">
      <Section id="flagged" icon={<ShieldAlert size={18} />} title={`Why was this flagged? · ${a.flags.length}`}>
        {a.flags.length ? <ul className="space-y-3">{a.flags.map((f, i) => <li key={i} className="rounded-lg bg-slate-50 p-3" data-testid={`item-ai-flag-${i}`}>
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">{f.field}<Pill>{f.status}</Pill></p>
          <p className="mt-1">{f.explanation}</p><Quotes items={f.evidence} />{f.question && <p className="mt-2 text-xs font-semibold text-amber-950">Ask: {f.question}</p>}</li>)}</ul> : <p>No specific details were flagged.</p>}
      </Section>
      <Section id="findings" icon={<ListChecks size={18} />} title="Key findings" open>
        <div className="grid gap-3 sm:grid-cols-2">{a.findings.map(f => <div key={f.key} className="rounded-lg border border-slate-200 p-3" data-testid={`card-ai-finding-${f.key}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="eyebrow text-slate-600">{f.label}</p><Pill>{f.status}</Pill></div>
          <p className="mt-2 break-words font-semibold text-slate-900">{f.value}</p>
          {f.sourceValue && f.sourceValue !== f.value && <p className="mt-1 text-xs text-slate-600">Original: {f.sourceValue}</p>}
          {f.key === 'missing' && <p className="mt-1 text-xs">{f.explanation}</p>}</div>)}</div>
      </Section>
      <Section id="evidence" icon={<BookOpenText size={18} />} title={`Evidence from report · ${a.evidence.length}`}>
        {a.evidence.length ? <ul className="space-y-3">{a.evidence.map((e, i) => <li key={i} data-testid={`item-ai-evidence-${i}`}><blockquote className="border-l-2 border-blue-300 pl-3 italic">“{e.quote}”</blockquote>{!!e.fields.length && <p className="mt-1 text-xs text-slate-600">Supports: {e.fields.join(', ')}</p>}</li>)}</ul> : <p>No exact resident statements were available to cite.</p>}
      </Section>
      <Section id="interpretation" icon={<Search size={18} />} title="AI interpretation">
        {a.interpretation.length ? <ul className="space-y-2">{a.interpretation.map((x, i) => <li key={i} data-testid={`item-ai-interpretation-${i}`}><span className="font-semibold text-slate-900">{x.field}</span> <Pill>{x.status}</Pill><p className="mt-1">{x.explanation}</p></li>)}</ul> : <p>No interpretation recorded.</p>}
      </Section>
      <Section id="contradictions" icon={<AlertTriangle size={18} />} title={`Contradictions · ${a.contradictions.length}`}>
        {a.contradictions.length ? <ul className="space-y-3">{a.contradictions.map((c, i) => {
          const reviewed = c.status === 'Human Review Recorded';
          return <li key={i} className={`rounded-lg p-3 ${reviewed ? 'bg-slate-50' : 'bg-amber-50'}`} data-testid={`item-ai-contradiction-${i}`}>
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">{reviewed ? 'Original retained · reviewed' : 'AI Uncertainty Detected'} · {c.field}<Pill>{c.status}</Pill></p>
            <p className="mt-1">{c.explanation}</p><Quotes items={c.evidence} />{c.question && <p className="mt-2 text-xs font-semibold">Ask: {c.question}</p>}</li>;
        })}</ul> : <p>No contradictions detected in the resident’s information.</p>}
      </Section>
      <Section id="missing" icon={<ClipboardList size={18} />} title={`Missing information · ${a.missingInformation.length}`}>
        {a.missingInformation.length ? <ul className="list-inside list-disc space-y-1" data-testid="list-ai-missing">{a.missingInformation.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p>No missing information flagged.</p>}
      </Section>
      <Section id="routing" icon={<Building2 size={18} />} title="Routing analysis">
        <p className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900" data-testid="text-ai-routing-candidate">Suggested: {a.routing.candidate}</span><Pill>{a.routing.status}</Pill></p>
        <p className="mt-2 text-xs text-slate-600">Resident requested (a claim, not an instruction): {a.routing.requested || 'None supplied'}</p>
        <p className="mt-2">{a.routing.explanation}</p>
        {a.humanDecision && <p className="mt-2 font-semibold text-slate-900" data-testid="text-ai-human-decision">Human decision: {a.humanDecision}</p>}
      </Section>
      <Section id="limitations" icon={<ShieldCheck size={18} />} title="AI limitations">{limitations}<p className="mt-3">This class prototype does not send reports or decisions to the City and does not contact emergency services.</p></Section>
    </div>
  </section>;
}
