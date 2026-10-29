import { notFound } from "next/navigation";
import { publicConfig } from "@/lib/config";
import { getTemplate } from "@/lib/agency/templates";
import type { BriefView, Job } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import { ensureSeeded } from "@/lib/seed";
import * as agency from "@/lib/services/agency";
import { generationSpend } from "@/lib/services/economics";
import { jobQa } from "@/lib/services/qa";
import { getBundle, getDashboard, profitabilityFor } from "@/lib/services/studio";
import { Presenter } from "./presenter";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

const DEMO_TITLES = ["After the Rain: Glass Monument", "Night Orchard: Slow Orbit"];

function draftDeliveryNote(job: Job, analysis: BriefView | null, selectedCount: number): string {
  const deliverables = analysis?.deliverables.map((d) => (d.quantity > 1 ? `${d.quantity}× ` : "") + d.title).join(", ") || "the agreed deliverables";
  return [
    `Hi ${job.clientName ?? "there"},`,
    ``,
    `The first cut of "${job.title}" is ready for your review. This package covers ${deliverables}.`,
    `We locked the look on approved keyframes first, then produced the final motion and finished the masters, keeping every shot consistent with the references and constraints you supplied.`,
    `${selectedCount} selected output${selectedCount === 1 ? "" : "s"} ${selectedCount === 1 ? "is" : "are"} attached below. Two things worth a look on your side: the after-storm transition and the reflections — flag anything and we'll fold it into the included revision round.`,
    ``,
    `Everything was produced inside the approved budget and timeline. Let us know and we'll prepare final delivery.`,
    ``,
    `— &more Design (draft prepared by GPT-6 Astra; review before sending)`,
  ].join("\n");
}

export default async function PresentPage(props: PageProps<"/present">) {
  await loadRuntimeConfig();
  await ensureSeeded();
  const sp = await props.searchParams;
  const cfg = publicConfig();

  const dash = await getDashboard();
  const demos = dash.map((d) => d.job).filter((j) => DEMO_TITLES.includes(j.title));
  const jobs = (demos.length ? demos : dash.map((d) => d.job)).map((j) => ({ id: j.id, title: j.title }));
  if (jobs.length === 0) notFound();

  const selectedId = typeof sp.job === "string" && jobs.some((j) => j.id === sp.job) ? sp.job : jobs[0].id;
  const bundle = await getBundle(selectedId);
  if (!bundle) notFound();
  const { job, analysis, workflow, generations, approvals } = bundle;
  const p = profitabilityFor(bundle);
  const qa = await jobQa(job.id);

  const settings = await agency.getAutonomy();
  const template = getTemplate(job.templateId);
  const memory = await agency.getClientMemoryForJob(job);
  const messages = (await agency.listMessages(job.id)).map((m) => ({ id: m.id, type: m.type, channel: m.channel, subject: m.subject, body: m.body, status: m.status, autoAllowed: m.autoAllowed, heldReason: m.heldReason }));
  const auditLog = (await agency.listAudit(job.id)).map((a) => ({ kind: a.kind, actor: a.actor, summary: a.summary, detail: a.detail, costDeltaUsd: a.costDeltaUsd }));
  const escalations = (await agency.listEscalations(job.id)).map((e) => ({ id: e.id, reason: e.reason, title: e.title, detail: e.detail, recommendedAction: e.recommendedAction, status: e.status }));
  const selfRepairs = (await agency.planSelfRepairs(job.id)).map((r) => ({
    stepName: r.stepName, modelLabel: r.modelLabel, component: r.decision.smallestFailedComponent,
    action: r.decision.recommendedAction, auto: r.decision.auto, incrementalCostUsd: r.decision.incrementalCostUsd,
    recommendation: r.decision.recommendation, escalationReason: r.decision.escalationReason,
  }));
  const deliveryPending = approvals.some((a) => a.kind === "final_delivery" && a.status === "pending");

  const gens = generations
    .filter((g) => !g.revisionId)
    .map((g) => ({ id: g.id, model: getModel(g.model).label, attempt: g.attempt, status: g.status, costEstimate: g.costEstimate, recorded: generationSpend(g), outputUrl: g.outputUrl, outputType: g.outputType, selected: g.selected, timedOut: !!g.timedOutAt }));
  const selected = generations.filter((g) => g.selected && g.status === "completed");
  const deliverables = selected.map((g) => ({ title: getModel(g.model).label, url: g.outputUrl ?? "", type: g.outputType ?? "image", attempt: g.attempt }));

  const data = {
    mockMode: cfg.mockMode,
    jobs,
    selectedId,
    job: { id: job.id, title: job.title, clientName: job.clientName, source: job.source, status: job.status, budget: job.budget, deadline: job.deadline, brief: job.rawBrief, analyzer: analysis?.analyzer ?? null },
    analysis: analysis
      ? {
          summary: analysis.summary, decision: analysis.decision, confidence: analysis.confidence,
          deliverables: analysis.deliverables.map((d) => ({ title: d.title, kind: d.kind, aspectRatio: d.aspectRatio, durationSec: d.durationSec, resolution: d.resolution, quantity: d.quantity })),
          rightsConcerns: analysis.rightsConcerns, missingInformation: analysis.missingInformation, rationale: analysis.rationale,
        }
      : null,
    workflow: workflow
      ? { approvalStatus: workflow.approvalStatus, maxBudget: workflow.maxBudget, estimatedTotalCost: workflow.estimatedTotalCost, steps: workflow.steps.map((s) => ({ order: s.order, name: s.name, model: getModel(s.modelId).label, attempts: s.estimatedAttempts, cost: s.estimatedTotalCost })) }
      : null,
    economics: {
      clientPrice: p.clientPrice, sourceFeePct: p.sourceFeePct, sourceFee: p.sourceFee, netRevenue: p.netRevenue,
      estimatedSpend: p.estimatedSpend, committedSpend: p.committedSpend, actualSpend: p.actualSpend,
      contingencyPct: p.contingencyPct, contingency: p.contingency, expectedGrossMargin: p.expectedGrossMargin, expectedGrossMarginPct: p.expectedGrossMarginPct,
    },
    generations: gens,
    qa,
    deliverables,
    deliveryNote: draftDeliveryNote(job, analysis, selected.length),
    autonomy: {
      maxAutoSpendPerJobUsd: settings.maxAutoSpendPerJobUsd,
      maxAutoSpendPerRepairUsd: settings.maxAutoSpendPerRepairUsd,
      maxAttemptsPerStep: settings.maxAttemptsPerStep,
      autoSendMessageTypes: settings.autoSendMessageTypes,
      autoShareConcepts: settings.autoShareConcepts,
      finalDeliveryAlwaysApproval: settings.finalDeliveryAlwaysApproval,
    },
    template: template ? { name: template.name, deliverablesSummary: template.deliverablesSummary, includedRevisions: template.includedRevisions, targetGrossMarginPct: template.targetGrossMarginPct, maxProductionSpendUsd: template.maxProductionSpendUsd } : null,
    clientMemory: memory ? { displayName: memory.displayName, tone: memory.tone, colors: memory.colors, fonts: memory.fonts, productDetails: memory.productDetails, rejectedStyles: memory.rejectedStyles, deliveryPreferences: memory.deliveryPreferences } : null,
    messages,
    auditLog,
    escalations,
    selfRepairs,
    deliveryPending,
  };

  return <Presenter data={data} />;
}
