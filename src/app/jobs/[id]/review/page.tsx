import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { config, publicConfig } from "@/lib/config";
import { computeCostPlan } from "@/lib/analysis/cost";
import type { Analysis } from "@/lib/analysis/schema";
import { ensureSeeded } from "@/lib/seed";
import { getBundle } from "@/lib/services/studio";
import { effectiveAnalysis } from "@/lib/services/intake";
import { daysUntil, usd } from "@/lib/utils";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

const DECISION_STYLE: Record<string, string> = {
  accept: "bg-ok-soft text-ok",
  human_review: "bg-warn-soft text-warn",
  reject: "bg-bad-soft text-bad",
};
const DECISION_LABEL: Record<string, string> = { accept: "Accept", human_review: "Human review", reject: "Reject" };

function Verdict({ decision }: { decision: string }) {
  return <span className={`rounded-md px-2 py-1 text-[12px] font-medium ${DECISION_STYLE[decision] ?? "bg-muted"}`}>{DECISION_LABEL[decision] ?? decision}</span>;
}

export default async function ReviewPage(props: PageProps<"/jobs/[id]/review">) {
  await ensureSeeded();
  const { id } = await props.params;
  const bundle = getBundle(id);
  if (!bundle || !bundle.intake) notFound();
  const { job, intake } = bundle;
  const cfg = publicConfig();

  const effective: Analysis = effectiveAnalysis(intake);
  const plan = computeCostPlan(effective, config.economics.maxAttemptsPerStep);
  const net = Math.round(job.budget * (1 - job.sourceFeePct) * 100) / 100;
  const contingency = Math.round(plan.estimatedSpend * job.contingencyPct * 100) / 100;
  const total = Math.round((plan.estimatedSpend + contingency) * 100) / 100;
  const margin = Math.round((net - total) * 100) / 100;
  const marginPct = job.budget > 0 ? margin / job.budget : 0;
  const locked = job.status !== "new" && job.status !== "needs_review";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link href={`/jobs/${job.id}`} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to job
      </Link>

      <header className="flex flex-col gap-2">
        <p className="eyebrow">Review analysis</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{job.title}</h1>
        <p className="text-[13px] text-muted-foreground">
          Analysed by <span className="font-medium text-foreground">{intake.analyzer}</span>
          {cfg.openaiLive ? " · live GPT-6 Astra" : " · offline mock (set OPENAI_API_KEY for the real model)"} · review status: {intake.reviewStatus}
        </p>
        {intake.warning ? <p className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{intake.warning}</p> : null}
      </header>

      {/* Deterministic decision */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">App decision (deterministic)</span>
            <Verdict decision={intake.decision} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Model suggested</span>
            <Verdict decision={effective.decision} />
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-[13px]">
          {intake.decisionReasons.map((r, i) => (
            <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/60" />{r}</li>
          ))}
        </ul>
      </section>

      {/* Catalog-priced plan — prices never come from the model */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-[14.5px] font-semibold">Deterministic cost (from catalog prices)</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          The model proposes capabilities and attempt estimates; the application resolves each to a catalogued model and price. Attempts are capped at {config.economics.maxAttemptsPerStep}/step.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="py-1 pr-3">Capability</th><th className="py-1 pr-3">Model</th><th className="py-1 pr-3 text-right">Attempts</th><th className="py-1 pr-3 text-right">Unit</th><th className="py-1 text-right">Step cost</th></tr>
            </thead>
            <tbody>
              {plan.steps.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 pr-3">{s.label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{s.modelId}</td>
                  <td className="py-1.5 pr-3 text-right tnum">{s.estimatedAttempts}</td>
                  <td className="py-1.5 pr-3 text-right tnum">{usd(s.unitCostUsd, { cents: true })}</td>
                  <td className="py-1.5 text-right tnum">{usd(s.stepCost, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.unpricedCapabilities.length ? (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            No catalog price for: {plan.unpricedCapabilities.join(", ")} — routed to human review instead of guessing.
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t pt-3 text-[13px] sm:w-80">
          <dt className="text-muted-foreground">Est. generation spend</dt><dd className="text-right tnum">{usd(plan.estimatedSpend, { cents: true })}</dd>
          <dt className="text-muted-foreground">+ Contingency ({Math.round(job.contingencyPct * 100)}%)</dt><dd className="text-right tnum">{usd(contingency, { cents: true })}</dd>
          <dt className="text-muted-foreground">Total vs budget {usd(config.economics.maxProductionBudgetUsd)}</dt><dd className="text-right tnum">{usd(total, { cents: true })}</dd>
          <dt className="text-muted-foreground">Net revenue (after {Math.round(job.sourceFeePct * 100)}% fee)</dt><dd className="text-right tnum">{usd(net, { cents: true })}</dd>
          <dt className="text-muted-foreground">Expected margin</dt>
          <dd className={`text-right tnum ${marginPct < config.economics.rejectBelowMarginPct ? "text-bad" : marginPct < config.economics.minGrossMarginPct ? "text-warn" : "text-ok"}`}>{usd(margin, { cents: true })} · {Math.round(marginPct * 100)}%</dd>
        </dl>
        <p className="mt-2 text-[11.5px] text-muted-foreground">Deadline in {daysUntil(job.deadline)} day(s).</p>
      </section>

      {/* Editable analysis */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-[14.5px] font-semibold">Extracted analysis — edit any field, then approve or reject</h2>
        <ReviewForm jobId={job.id} initial={effective} locked={locked} />
      </section>

      {/* Original vs edited comparison */}
      {intake.edited ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-[14px] font-semibold">Compare with the original analysis (as analysed)</summary>
          <OriginalView original={intake.original} />
        </details>
      ) : null}
    </div>
  );
}

function OriginalView({ original }: { original: Analysis }) {
  const row = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[160px_1fr] gap-3 border-t py-1.5 text-[13px]">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 whitespace-pre-wrap">{value}</div>
    </div>
  );
  return (
    <div className="mt-3">
      {row("Job type", original.jobType)}
      {row("Summary", original.conciseSummary)}
      {row("Confidence", `${original.confidence}%`)}
      {row("Revision risk", original.revisionRisk)}
      {row("Deliverables", original.deliverables.map((d) => `${d.name} (${d.format}${d.aspectRatio ? `, ${d.aspectRatio}` : ""}${d.duration ? `, ${d.duration}` : ""})`).join("\n") || "—")}
      {row("Supplied assets", original.suppliedAssets.join("\n") || "—")}
      {row("Missing assets", original.missingAssets.join("\n") || "—")}
      {row("Questions", original.questionsForClient.join("\n") || "—")}
      {row("Rights/consent", original.rightsAndConsentFlags.map((f) => `${f.kind}: ${f.detail}`).join("\n") || "—")}
      {row("Proposed workflow", original.proposedWorkflow.map((s, i) => `${s.capability} ×${original.estimatedAttemptsByStep[i] ?? 0} — ${s.description}`).join("\n") || "—")}
      {row("Assumptions", original.assumptions.join("\n") || "—")}
    </div>
  );
}
