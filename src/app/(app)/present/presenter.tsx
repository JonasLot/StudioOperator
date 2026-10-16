"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2, CircleSlash, RotateCcw, TriangleAlert, Download, FlaskConical, Bot, ShieldCheck, Mail, ScrollText, Flag, Send } from "lucide-react";
import { resetDemoToPresentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { AUDIT_KIND_LABEL, CHANNEL_LABEL, MESSAGE_TYPE_LABEL, type AuditKind, type MessageChannel, type MessageType } from "@/lib/domain/types";
import type { QaReport, QaStatus, QaVerdict } from "@/lib/qa/qa";
import { VERDICT_LABEL } from "@/lib/qa/qa";
import type { RepairDecision } from "@/lib/qa/repair";
import { cn, usd } from "@/lib/utils";

interface PresenterData {
  mockMode: boolean;
  jobs: { id: string; title: string }[];
  selectedId: string;
  job: { id: string; title: string; clientName: string | null; source: string; status: string; budget: number; deadline: string; brief: string; analyzer: string | null };
  analysis: { summary: string; decision: string; confidence: number; deliverables: { title: string; kind: string; aspectRatio: string | null; durationSec: number | null; resolution: string | null; quantity: number }[]; rightsConcerns: string[]; missingInformation: string[]; rationale: string[] } | null;
  workflow: { approvalStatus: string; maxBudget: number; estimatedTotalCost: number; steps: { order: number; name: string; model: string; attempts: number; cost: number }[] } | null;
  economics: { clientPrice: number; sourceFeePct: number; sourceFee: number; netRevenue: number; estimatedSpend: number; committedSpend: number; actualSpend: number; contingencyPct: number; contingency: number; expectedGrossMargin: number; expectedGrossMarginPct: number };
  generations: { id: string; model: string; attempt: number; status: string; costEstimate: number; recorded: number; outputUrl: string | null; outputType: string | null; selected: boolean; timedOut: boolean }[];
  qa: { outputs: { generationId: string; stepName: string; deliverable: string; modelLabel: string; report: QaReport; repair: RepairDecision | null }[]; overallVerdict: QaVerdict | null; autoRepairable: number; needsApproval: number; limits: { perRepairMaxUsd: number; perJobRepairMaxUsd: number; maxAutoRepairsPerJob: number } };
  deliverables: { title: string; url: string; type: string; attempt: number }[];
  deliveryNote: string;
  autonomy: { maxAutoSpendPerJobUsd: number; maxAutoSpendPerRepairUsd: number; maxAttemptsPerStep: number; autoSendMessageTypes: MessageType[]; autoShareConcepts: boolean; finalDeliveryAlwaysApproval: boolean };
  template: { name: string; deliverablesSummary: string; includedRevisions: number; targetGrossMarginPct: number; maxProductionSpendUsd: number } | null;
  clientMemory: { displayName: string; tone: string | null; colors: string[]; fonts: string[]; productDetails: string[]; rejectedStyles: string[]; deliveryPreferences: string | null } | null;
  messages: { id: string; type: MessageType; channel: MessageChannel; subject: string; body: string; status: string; autoAllowed: boolean; heldReason: string | null }[];
  auditLog: { kind: AuditKind; actor: string; summary: string; detail: string | null; costDeltaUsd: number | null }[];
  escalations: { id: string; reason: string; title: string; detail: string; recommendedAction: string; status: string }[];
  selfRepairs: { stepName: string; modelLabel: string; component: string | null; action: string; auto: boolean; incrementalCostUsd: number; recommendation: string; escalationReason: string | null }[];
  deliveryPending: boolean;
}

const STEPS = ["Brief", "Analysis", "Approval", "Generation", "QA", "Delivery"] as const;
const STATUS_DOT: Record<QaStatus, string> = { pass: "bg-ok", warn: "bg-warn", fail: "bg-bad", na: "bg-muted-foreground/40" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

function Stat({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[12px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className={cn("tnum mt-1 text-2xl font-semibold", accent)}>{v}</div>
    </div>
  );
}

export function Presenter({ data }: { data: PresenterData }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const d = data;
  const show = (i: number) => step >= i;

  return (
    <div className="flex flex-col gap-6">
      {/* Control bar */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <NativeSelect className="w-64" value={d.selectedId} onChange={(e) => { setStep(0); router.push(`/present?job=${e.target.value}`); }}>
            {d.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </NativeSelect>
          {d.mockMode ? <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[12px]"><FlaskConical className="size-3.5" /> Mock mode — no external calls, no secrets</span> : null}
        </div>
        <form action={resetDemoToPresentAction}>
          <Button type="submit" variant="outline" size="sm"><RotateCcw /> Reset to seeded brief</Button>
        </form>
      </div>

      {/* Supervised-autonomy strip: the agent runs the job; the human owns the promises that matter. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 font-medium"><Bot className="size-4 text-brand" /> Agent runs the job</span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-muted-foreground" /> You own: contracts, payments, rights/identity, final delivery</span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="tnum rounded bg-muted px-2 py-0.5">auto ≤ {usd(d.autonomy.maxAutoSpendPerJobUsd)}/job</span>
          <span className="tnum rounded bg-muted px-2 py-0.5">≤ {usd(d.autonomy.maxAutoSpendPerRepairUsd)}/repair</span>
          <span className="rounded bg-muted px-2 py-0.5">concepts {d.autonomy.autoShareConcepts ? "auto" : "approval"}</span>
          <span className="rounded bg-muted px-2 py-0.5">delivery {d.autonomy.finalDeliveryAlwaysApproval ? "approval" : "auto"}</span>
        </span>
      </div>

      {/* Big status + step-through */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.2em] text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          <h1 className="text-[40px] font-semibold leading-none tracking-[-0.03em] sm:text-[52px]">{STEPS[step]}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ChevronLeft /> Back</Button>
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Next <ChevronRight /></Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>{i + 1}. {s}</button>
        ))}
      </div>

      {/* 1. Brief */}
      {show(0) ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Brief — {d.job.title}</h2>
          <div className="mb-3 flex flex-wrap gap-2 text-[13px] text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1">{d.job.source} · {d.job.clientName ?? "client"}</span>
            <span className="rounded-md bg-muted px-2 py-1 tnum">{usd(d.job.budget, { cents: true })} fixed package</span>
            <span className="rounded-md bg-muted px-2 py-1">due {d.job.deadline}</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-[13.5px] leading-relaxed">{d.job.brief}</pre>
        </section>
      ) : null}

      {/* Client memory + template (account-level context the agent carries in) */}
      {show(0) && (d.clientMemory || d.template) ? (
        <section className="grid gap-4 md:grid-cols-2">
          {d.clientMemory ? (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-2 text-[14px] font-semibold">Client memory — {d.clientMemory.displayName}</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                {d.clientMemory.tone ? (<><dt className="text-muted-foreground">Tone</dt><dd>{d.clientMemory.tone}</dd></>) : null}
                {d.clientMemory.colors.length ? (<><dt className="text-muted-foreground">Colours</dt><dd className="flex flex-wrap items-center gap-1.5">{d.clientMemory.colors.map((c) => <span key={c} className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border" style={{ background: c }} />{c}</span>)}</dd></>) : null}
                {d.clientMemory.fonts.length ? (<><dt className="text-muted-foreground">Fonts</dt><dd>{d.clientMemory.fonts.join(", ")}</dd></>) : null}
                {d.clientMemory.rejectedStyles.length ? (<><dt className="text-muted-foreground">Avoid</dt><dd>{d.clientMemory.rejectedStyles.join(", ")}</dd></>) : null}
                {d.clientMemory.deliveryPreferences ? (<><dt className="text-muted-foreground">Delivery</dt><dd>{d.clientMemory.deliveryPreferences}</dd></>) : null}
              </dl>
              <p className="mt-2 text-[11.5px] text-muted-foreground">Memory is never consent for a new person’s likeness, voice, or a new use.</p>
            </div>
          ) : null}
          {d.template ? (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold"><Bot className="size-4 text-brand" /> {d.template.name} template</h3>
              <p className="rounded-md bg-muted px-2.5 py-1.5 text-[12.5px]">{d.template.deliverablesSummary}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
                <div><dt className="text-muted-foreground">Target margin</dt><dd className="tnum font-medium text-ok">{pct(d.template.targetGrossMarginPct)}</dd></div>
                <div><dt className="text-muted-foreground">Max spend</dt><dd className="tnum font-medium">{usd(d.template.maxProductionSpendUsd)}</dd></div>
                <div><dt className="text-muted-foreground">Incl. revisions</dt><dd className="tnum font-medium">{d.template.includedRevisions}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-card/50 p-5 text-[12.5px] text-muted-foreground">Bespoke run — no fixed template. Routed by the model router for this specific creative problem.</div>
          )}
        </section>
      ) : null}

      {/* 2. Analysis */}
      {show(1) && d.analysis ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-[18px] font-semibold">Analysis <span className="ml-2 text-[12px] font-normal text-muted-foreground">by {d.job.analyzer}</span></h2>
          <p className="text-[14px]">{d.analysis.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <span className="rounded-md bg-muted px-2 py-1">decision: <strong>{d.analysis.decision.replace("_", " ")}</strong></span>
            <span className="rounded-md bg-muted px-2 py-1 tnum">confidence {pct(d.analysis.confidence)}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {d.analysis.deliverables.map((x, i) => (
              <div key={i} className="rounded-lg border px-3 py-2 text-[13px]">
                <div className="font-medium">{x.quantity > 1 ? `${x.quantity}× ` : ""}{x.title}</div>
                <div className="text-muted-foreground">{[x.kind, x.aspectRatio, x.durationSec ? `${x.durationSec}s` : null, x.resolution].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Client Agent conversation — drafted vs auto-sent per autonomy + channel */}
      {show(1) && d.messages.length ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[18px] font-semibold"><Mail className="size-4 text-muted-foreground" /> Client Agent</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">The agent writes the client relationship. Messages are auto-sent only on an allowed channel and type; everything else is drafted for you. Third-party marketplaces are never auto-sent.</p>
          <div className="flex flex-col gap-2.5">
            {d.messages.map((m) => (
              <details key={m.id} className="rounded-lg border">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="font-medium">{MESSAGE_TYPE_LABEL[m.type]}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{CHANNEL_LABEL[m.channel]}</span>
                  <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", m.status === "sent" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                    {m.status === "sent" ? <><Send className="size-3" /> {m.autoAllowed ? "auto-sent" : "sent"}</> : <>drafted — needs approval</>}
                  </span>
                  <span className="ml-auto truncate text-muted-foreground">{m.subject}</span>
                </summary>
                <div className="border-t px-3 py-2.5">
                  {m.heldReason ? <p className="mb-2 rounded bg-warn-soft/50 px-2 py-1 text-[12px] text-warn">{m.heldReason}</p> : null}
                  <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/90">{m.body}</pre>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Approval + economics side-by-side */}
      {show(2) && d.workflow ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-[18px] font-semibold">Approved workflow & maximum spend</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Status: <strong>{d.workflow.approvalStatus}</strong> · cap {usd(d.workflow.maxBudget)} · nothing ran before this approval.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 pr-3">Step</th><th className="py-1 pr-3">Model</th><th className="py-1 pr-3 text-right">Attempts</th><th className="py-1 text-right">Est. cost</th></tr></thead>
              <tbody>{d.workflow.steps.map((s) => <tr key={s.order} className="border-t"><td className="py-1.5 pr-3">{s.order}. {s.name}</td><td className="py-1.5 pr-3 text-muted-foreground">{s.model}</td><td className="py-1.5 pr-3 text-right tnum">{s.attempts}</td><td className="py-1.5 text-right tnum">{usd(s.cost, { cents: true })}</td></tr>)}</tbody>
            </table>
          </div>
          <h3 className="mt-5 mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Profit model</h3>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
            <Stat k="Client price" v={usd(d.economics.clientPrice, { cents: true })} />
            <Stat k={`Channel fee ${pct(d.economics.sourceFeePct)}`} v={`−${usd(d.economics.sourceFee, { cents: true })}`} />
            <Stat k="API cost (est.)" v={`−${usd(d.economics.estimatedSpend, { cents: true })}`} />
            <Stat k={`Contingency ${pct(d.economics.contingencyPct)}`} v={`−${usd(d.economics.contingency, { cents: true })}`} />
            <Stat k="Expected gross profit" v={usd(d.economics.expectedGrossMargin, { cents: true })} accent={d.economics.expectedGrossMarginPct >= 0.45 ? "text-ok" : d.economics.expectedGrossMarginPct >= 0.15 ? "text-warn" : "text-bad"} />
          </div>
        </section>
      ) : null}

      {/* 4. Generation cost ledger */}
      {show(3) ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Production cost ledger</h2>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 pr-3">Model</th><th className="py-1 pr-3">Take</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3 text-right">Estimate</th><th className="py-1 text-right">Recorded</th></tr></thead>
              <tbody>{d.generations.map((g) => <tr key={g.id} className="border-t"><td className="py-1.5 pr-3">{g.model}</td><td className="py-1.5 pr-3 tnum">#{g.attempt}</td><td className="py-1.5 pr-3">{g.status}{g.timedOut ? " · timed out" : ""}{g.selected ? " ✓" : ""}</td><td className="py-1.5 pr-3 text-right tnum">{usd(g.costEstimate, { cents: true })}</td><td className="py-1.5 text-right tnum">{usd(g.recorded, { cents: true })}</td></tr>)}</tbody>
              <tfoot><tr className="border-t font-semibold"><td className="py-2" colSpan={4}>Total production spend</td><td className="py-2 text-right tnum">{usd(d.economics.committedSpend, { cents: true })}</td></tr></tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {/* 5. QA */}
      {show(4) ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-[18px] font-semibold">Automated QA vs the approved brief</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Overall: <strong>{d.qa.overallVerdict ? VERDICT_LABEL[d.qa.overallVerdict] : "—"}</strong>. Repairs auto-run only within the pre-approved limits (per-repair {usd(d.qa.limits.perRepairMaxUsd)}, per-job {usd(d.qa.limits.perJobRepairMaxUsd)}, max {d.qa.limits.maxAutoRepairsPerJob}).</p>
          <div className="flex flex-col gap-3">
            {d.qa.outputs.map((o) => (
              <div key={o.generationId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-medium">{o.stepName} <span className="text-muted-foreground">· {o.modelLabel}</span></span>
                  <span className={cn("rounded px-2 py-0.5 text-[12px] font-medium", o.report.verdict === "delivery_review" ? "bg-ok-soft text-ok" : o.report.verdict === "regenerate" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>{VERDICT_LABEL[o.report.verdict]}</span>
                </div>
                <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {o.report.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[c.status])} />
                      <span><span className="font-medium">{c.label}</span>{c.heuristic ? <span className="text-muted-foreground"> (heuristic)</span> : null}: <span className="text-muted-foreground">{c.detail}</span></span>
                    </li>
                  ))}
                </ul>
                {o.repair ? (
                  <div className={cn("mt-3 rounded-md border px-3 py-2 text-[12.5px]", o.repair.auto ? "bg-ok-soft/40" : "bg-warn-soft/50")}>
                    <div className="flex items-center gap-1.5 font-medium">{o.repair.auto ? <CheckCircle2 className="size-4 text-ok" /> : <TriangleAlert className="size-4 text-warn" />}{o.repair.auto ? "Targeted repair — auto-runs within limits" : "Repair needs human approval"}{o.repair.blockedBy ? ` (over ${o.repair.blockedBy})` : ""}</div>
                    <div className="mt-1 text-muted-foreground">Reason: {o.repair.reason}</div>
                    <div className="mt-1 tnum">Model {o.repair.modelLabel} · +{usd(o.repair.incrementalCostUsd, { cents: true })} ({o.repair.attempts} attempts) → new total {usd(o.repair.newTotalUsd, { cents: true })} · margin {usd(o.repair.newMarginUsd, { cents: true })} ({pct(o.repair.newMarginPct)})</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Supervised self-repair loop */}
      {show(4) && d.selfRepairs.length ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-[18px] font-semibold">Supervised self-repair</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">For each failed component the agent picks the smallest fix and continues on its own only within the pre-approved spend limit and with no new rights/identity concern. Everything else escalates.</p>
          <div className="flex flex-col gap-2">
            {d.selfRepairs.map((r, i) => (
              <div key={i} className={cn("rounded-lg border px-3 py-2.5 text-[12.5px]", r.auto ? "bg-ok-soft/40" : "bg-warn-soft/50")}>
                <div className="flex flex-wrap items-center gap-2">
                  {r.auto ? <CheckCircle2 className="size-4 text-ok" /> : <TriangleAlert className="size-4 text-warn" />}
                  <span className="font-medium">{r.stepName}</span>
                  <span className="text-muted-foreground">· {r.component ?? "issue"}</span>
                  <span className="rounded bg-card px-1.5 py-0.5 text-[11px]">{r.action.replace(/_/g, " ")}</span>
                  <span className="ml-auto tnum text-muted-foreground">+{usd(r.incrementalCostUsd, { cents: true })}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{r.recommendation}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Escalations — what the agent handed to the human */}
      {show(4) && d.escalations.length ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[18px] font-semibold"><Flag className="size-4 text-warn" /> Escalations to you</h2>
          <div className="flex flex-col gap-2">
            {d.escalations.map((e) => (
              <div key={e.id} className="rounded-lg border px-3 py-2.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px]", e.status === "open" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>{e.status}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{e.detail}</p>
                <p className="mt-1"><span className="font-medium">Recommended:</span> {e.recommendedAction}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 6. Delivery */}
      {show(5) ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Final deliverables</h2>
          <div className={cn("mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]", d.deliveryPending ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
            {d.deliveryPending ? <TriangleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
            {d.deliveryPending
              ? "Delivery is drafted and ready — but final delivery always requires your approval. The agent cannot send it on its own."
              : "Final delivery was approved by you."}
          </div>
          {d.deliverables.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {d.deliverables.map((x, i) => (
                <figure key={i} className="overflow-hidden rounded-lg border bg-muted/40">
                  <div className="aspect-video">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {x.url ? <img src={x.url} alt={x.title} className="size-full object-cover" /> : null}
                  </div>
                  <figcaption className="flex items-center justify-between px-2 py-1.5 text-[12px]">
                    <span className="truncate">{x.title} #{x.attempt}</span>
                    {x.url ? <a href={x.url} download className="inline-flex items-center gap-1 text-foreground/70 hover:text-foreground"><Download className="size-3.5" /> download</a> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><CircleSlash className="size-4" /> No outputs selected yet — select takes on the job&apos;s Outputs tab.</p>
          )}
          <h3 className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Client-ready delivery note (drafted by Astra)</h3>
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-[13.5px] leading-relaxed">{d.deliveryNote}</pre>
        </section>
      ) : null}

      {/* Autonomy audit log — every model decision, message, approval, generation, repair, cost change, escalation */}
      {show(4) && d.auditLog.length ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[18px] font-semibold"><ScrollText className="size-4 text-muted-foreground" /> Autonomy audit log</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">Everything the agent did or proposed, so the human can supervise the promises that matter.</p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="py-1 pr-3">Kind</th><th className="py-1 pr-3">Who</th><th className="py-1 pr-3">Event</th><th className="py-1 text-right">Δ cost</th></tr></thead>
              <tbody>
                {d.auditLog.map((a, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap"><span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{AUDIT_KIND_LABEL[a.kind]}</span></td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{a.actor}</td>
                    <td className="py-1.5 pr-3">{a.summary}{a.detail ? <span className="block text-[11.5px] text-muted-foreground">{a.detail}</span> : null}</td>
                    <td className="py-1.5 text-right tnum text-muted-foreground">{a.costDeltaUsd != null ? usd(a.costDeltaUsd, { cents: true }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
