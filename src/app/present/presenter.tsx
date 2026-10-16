"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2, CircleSlash, RotateCcw, TriangleAlert, Download, FlaskConical } from "lucide-react";
import { resetDemoToPresentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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

      {/* 6. Delivery */}
      {show(5) ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold">Final deliverables</h2>
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
    </div>
  );
}
