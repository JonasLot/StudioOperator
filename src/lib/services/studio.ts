import "server-only";
import { computeCostPlan } from "@/lib/analysis/cost";
import { buildWorkflow } from "@/lib/analysis/plan";
import { deriveBriefFacts } from "@/lib/analysis/view";
import { config, scrubSecrets } from "@/lib/config";
import { persistAsset } from "@/lib/higgsfield/asset-store";
import { TAKE_REVIEWS } from "@/lib/domain/types";
import type {
  TakeReview,
  ApprovalKind,
  ApprovalRequest,
  BriefView,
  Generation,
  Job,
  JobBundle,
  JobSource,
  Revision,
  Workflow,
  WorkflowStep,
} from "@/lib/domain/types";
import { MODEL_CATALOG, getModel } from "@/lib/higgsfield/catalog";
import { acceptsImageUrls } from "@/lib/higgsfield/request";
import { getProvider } from "@/lib/higgsfield/provider";
import { getRepo } from "@/lib/repo";
import { describeKeyShape } from "@/lib/secrets/crypto";
import { secretStatus } from "@/lib/secrets";
import { audit } from "./audit";
import { computeProfitability } from "./economics";
import {
  GuardrailError,
  assertMaxBudgetSane,
  assertRightsCleared,
  assertWorkflowApproved,
  committedSpend,
  fitsBudget,
} from "./guardrails";
import { newId } from "./ids";
import { briefView, effectiveAnalysis, getBrief, runIntakeAnalysis } from "./intake";
import { planRevision } from "./revisions";
import { stepAwaitingReview } from "./review-gate";

const now = () => new Date().toISOString();
const MAX_AUTO_RETRIES = 2;

async function log(jobId: string, actor: "operator" | "agent" | "system", message: string) {
  await getRepo().insertActivity({ id: newId("ev"), jobId, actor, message, createdAt: now() });
}

async function requestApproval(jobId: string, kind: ApprovalKind, title: string, reason: string, amount: number | null, refId: string | null) {
  const repo = getRepo();
  const existing = (await repo.listApprovals(jobId)).find((a) => a.kind === kind && a.status === "pending" && a.refId === refId);
  if (existing) return existing;
  const a: ApprovalRequest = { id: newId("ap"), jobId, kind, status: "pending", title, reason, amount, refId, decidedBy: null, decidedAt: null, createdAt: now() };
  await repo.insertApproval(a);
  await log(jobId, "agent", `Requested human approval: ${title}`);
  return a;
}

async function decideApproval(id: string, status: "approved" | "rejected", by: string) {
  await getRepo().updateApproval(id, { status, decidedBy: by, decidedAt: now() });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBundle(jobId: string): Promise<JobBundle | null> {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job) return null;
  // Independent reads run side by side: on a remote database each is a network round trip.
  const [intake, workflow, generations, revisions, approvals, activity] = await Promise.all([
    repo.getLatestIntakeAnalysis(jobId),
    repo.getCurrentWorkflow(jobId),
    repo.listGenerations(jobId),
    repo.listRevisions(jobId),
    repo.listApprovals(jobId),
    repo.listActivity(jobId),
  ]);
  return { job, analysis: intake ? briefView(intake) : null, intake, workflow, generations, revisions, approvals, activity };
}

/** Group rows by job id so a list screen can read each table once instead of once per job. */
function byJob<T extends { jobId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.jobId);
    if (list) list.push(r);
    else m.set(r.jobId, [r]);
  }
  return m;
}

export async function getDashboard() {
  const repo = getRepo();
  // One query per table, not one per job, and all of them at once: every query is a round trip on a remote database.
  const [jobs, intakes, currentWorkflows, approvals, generationRows, revisionRows] = await Promise.all([
    repo.listJobs(),
    repo.listLatestIntakeAnalyses(),
    repo.listCurrentWorkflows(),
    repo.listApprovals(),
    repo.listAllGenerations(),
    repo.listAllRevisions(),
  ]);
  const analyses = new Map(intakes.map((a) => [a.jobId, briefView(a)]));
  const workflows = new Map(currentWorkflows.map((w) => [w.jobId, w]));
  const allGenerations = byJob(generationRows);
  const allRevisions = byJob(revisionRows);
  return jobs.map((job) => {
    const workflow = workflows.get(job.id) ?? null;
    const generations = allGenerations.get(job.id) ?? [];
    const revisions = allRevisions.get(job.id) ?? [];
    const p = computeProfitability(job, workflow, generations, revisions);
    const active = generations.filter((g) => g.status === "queued" || g.status === "in_progress").length;
    const done = generations.filter((g) => g.status === "completed").length;
    return {
      job,
      decision: analyses.get(job.id)?.decision ?? null,
      pendingApprovals: approvals.filter((a) => a.jobId === job.id && a.status === "pending"),
      profitability: p,
      progress: generations.length ? done / generations.length : 0,
      activeGenerations: active,
      stepCount: workflow?.steps.length ?? 0,
      kind: (() => {
        const d = analyses.get(job.id)?.deliverables ?? [];
        if (d.some((x) => ["film", "social", "cutdown"].includes(x.kind))) return "video" as const;
        if (d.some((x) => x.kind === "still")) return "image" as const;
        return "brief" as const;
      })(),
      outputs: done,
    };
  });
}

// ---------------------------------------------------------------------------
// Intake → analysis → plan
// ---------------------------------------------------------------------------

export interface NewJobInput {
  title: string;
  source: JobSource;
  clientName: string | null;
  rawBrief: string;
  budget: number;
  deadline: string;
  clientNotes: string | null;
  referenceAssets: string[];
  sourceFeePct?: number;
  contingencyPct?: number;
  templateId?: string | null;
}

export async function createJob(input: NewJobInput) {
  const repo = getRepo();
  const job: Job = {
    id: newId("job"),
    title: input.title.trim() || "Untitled brief",
    source: input.source,
    clientName: input.clientName,
    rawBrief: input.rawBrief.trim(),
    budget: input.budget,
    deadline: input.deadline,
    status: "new",
    clientNotes: input.clientNotes,
    referenceAssets: input.referenceAssets,
    sourceFeePct: input.sourceFeePct ?? config.economics.sourceFeePct[input.source],
    contingencyPct: input.contingencyPct ?? config.economics.defaultContingencyPct,
    rightsCleared: false,
    templateId: input.templateId ?? null,
    deliveredAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await repo.insertJob(job);
  await log(job.id, "operator", `Brief pasted from ${input.source}. Client price $${input.budget}.`);
  // One structured analysis (OpenAI Responses / mock) -> deterministic decision -> priced plan.
  try {
    await runIntakeAnalysis(job);
  } catch (err) {
    await log(job.id, "system", `Intake analysis could not be stored: ${(err as Error).message}`);
    return job.id;
  }
  await replanFromIntake(job.id);
  return job.id;
}

/** Re-run the analysis on the brief, then rebuild the plan from the new result. */
export async function analyzeAndPlan(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  await assertNotApproved(jobId);
  await runIntakeAnalysis(job);
  await replanFromIntake(jobId);
}

async function assertNotApproved(jobId: string) {
  const current = await getRepo().getCurrentWorkflow(jobId);
  if (current && current.approvalStatus === "approved") {
    throw new GuardrailError("This job already has an approved workflow. Re-planning would be a material change — raise a revision instead.");
  }
}

/**
 * Build the production plan from the job's latest intake analysis (human-edited if present).
 * The plan is the priced cost plan the decision was made on — same steps, models and attempts —
 * so what a human approves is what was costed. Refuses once a workflow is approved.
 */
export async function replanFromIntake(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  const record = await repo.getLatestIntakeAnalysis(jobId);
  if (!record) throw new GuardrailError("There is no analysis to plan from yet.");
  await assertNotApproved(jobId);
  const current = await repo.getCurrentWorkflow(jobId);

  const analysis = effectiveAnalysis(record);
  const facts = deriveBriefFacts(analysis);
  const costPlan = computeCostPlan(analysis, config.economics.maxAttemptsPerStep);
  const decision = record.decision;

  await repo.transaction(async () => {
    const version = (current?.version ?? 0) + 1;
    const workflow = buildWorkflow(costPlan, facts, jobId, version, job.contingencyPct);

    if (current) await repo.updateWorkflow(current.id, { approvalStatus: "superseded" });
    for (const a of (await repo.listApprovals(jobId)).filter((x) => x.status === "pending" && (x.kind === "initial_workflow" || x.kind === "rights_clearance"))) {
      await repo.updateApproval(a.id, { status: "rejected", decidedBy: "system", decidedAt: now(), reason: a.reason + " (superseded by re-analysis)" });
    }
    workflow.approvalStatus = decision === "reject" ? "draft" : "pending";
    await repo.insertWorkflow(workflow);

    if (costPlan.unpricedCapabilities.length) {
      await log(jobId, "system", `No catalog price for ${costPlan.unpricedCapabilities.join(", ")} — left out of the plan and routed to human review.`);
    }
    await log(jobId, "agent", `Production plan v${version}: ${workflow.steps.length} steps, est. $${workflow.estimatedTotalCost.toFixed(2)}, proposed cap $${workflow.maxBudget}.`);
    await audit({ jobId, kind: "decision", summary: `${record.analyzer} recommended "${decision}" (${analysis.confidence}% confidence, ${workflow.steps.length}-step plan, est. $${workflow.estimatedTotalCost.toFixed(2)}).`, detail: record.decisionReasons.join(" ") });

    if (decision === "reject") {
      await repo.updateJob(jobId, { status: "rejected", rightsCleared: false });
      await log(jobId, "agent", "Moved to Rejected. Reopen to override.");
      return;
    }
    await repo.updateJob(jobId, { status: "needs_review", rightsCleared: facts.rightsConcerns.length === 0 });
    if (facts.rightsConcerns.length) {
      await requestApproval(jobId, "rights_clearance", "Clear rights concerns", facts.rightsConcerns.join(" "), null, record.id);
    }
    await requestApproval(
      jobId,
      "initial_workflow",
      "Approve workflow & maximum budget",
      `Plan v${version} with ${workflow.steps.length} steps. Estimated spend $${workflow.estimatedTotalCost.toFixed(2)}.`,
      workflow.maxBudget,
      workflow.id,
    );
  });
}

/**
 * After a human edits and saves the intake analysis: rebuild the plan from the edits, unless the
 * workflow is already approved (an approved plan only changes through a revision).
 */
export async function replanAfterReview(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job) return;
  if (wf?.approvalStatus === "approved") {
    await log(jobId, "system", "Edits saved. The workflow is already approved, so the plan is unchanged — raise a revision to change scope.");
    return;
  }
  await replanFromIntake(jobId);
}

export async function updateEconomics(jobId: string, patch: { sourceFeePct?: number; contingencyPct?: number; budget?: number }) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  const wf = await repo.getCurrentWorkflow(jobId);
  if (patch.budget !== undefined && wf?.approvalStatus === "approved") {
    throw new GuardrailError("Client price is locked once the workflow is approved.");
  }
  await repo.updateJob(jobId, patch);
  if (wf && wf.approvalStatus !== "approved" && patch.contingencyPct !== undefined) {
    const maxBudget = Math.ceil(wf.estimatedTotalCost * (1 + patch.contingencyPct));
    await repo.updateWorkflow(wf.id, { maxBudget });
    const pending = (await repo.listApprovals(jobId)).find((a) => a.kind === "initial_workflow" && a.status === "pending");
    if (pending) await repo.updateApproval(pending.id, { amount: maxBudget });
  }
  await log(jobId, "operator", "Updated pricing assumptions.");
}

// ---------------------------------------------------------------------------
// Human decisions
// ---------------------------------------------------------------------------

export async function clearRights(jobId: string, approvalId: string, note: string) {
  const repo = getRepo();
  await repo.transaction(async () => {
    await decideApproval(approvalId, "approved", config.operatorName);
    await repo.updateJob(jobId, { rightsCleared: true });
    await log(jobId, "operator", `Cleared rights concerns${note ? `: ${note}` : "."}`);
  });
}

export async function approveInitialWorkflow(jobId: string, maxBudget: number) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  const analysis = await getBrief(jobId);
  if (!job || !wf || !analysis) throw new GuardrailError("Nothing to approve.");
  if (job.status !== "needs_review") throw new GuardrailError(`Job is ${job.status}; only jobs in Needs Review can be approved.`);
  assertRightsCleared(job, analysis.rightsConcerns);
  assertMaxBudgetSane(maxBudget, wf.estimatedTotalCost, job.budget);

  await repo.transaction(async () => {
    await repo.updateWorkflow(wf.id, { approvalStatus: "approved", maxBudget, approvedAt: now(), approvedBy: config.operatorName });
    const pending = (await repo.listApprovals(jobId)).find((a) => a.kind === "initial_workflow" && a.status === "pending");
    if (pending) {
      await repo.updateApproval(pending.id, { amount: maxBudget });
      await decideApproval(pending.id, "approved", config.operatorName);
    }
    await repo.updateJob(jobId, { status: "approved" });
    await log(jobId, "operator", `Approved workflow v${wf.version} with a $${maxBudget} generation cap. Agent may operate inside this limit.`);
    await audit({ jobId, kind: "approval", actor: "operator", summary: `Approved workflow v${wf.version} and a $${maxBudget} generation cap.`, costDeltaUsd: null });
  });
}

export async function rejectJob(jobId: string, reason: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  if (["generating", "delivered"].includes(job.status)) throw new GuardrailError(`Cannot reject a job that is ${job.status}.`);
  await repo.transaction(async () => {
    for (const a of (await repo.listApprovals(jobId)).filter((x) => x.status === "pending")) await decideApproval(a.id, "rejected", config.operatorName);
    await repo.updateJob(jobId, { status: "rejected" });
    await log(jobId, "operator", `Rejected job${reason ? `: ${reason}` : "."}`);
  });
}

export async function reopenJob(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job || job.status !== "rejected") throw new GuardrailError("Only rejected jobs can be reopened.");
  await log(jobId, "operator", "Reopened job for review (override).");
  await repo.updateJob(jobId, { status: "needs_review" });
  const wf = await repo.getCurrentWorkflow(jobId);
  const analysis = await getBrief(jobId);
  if (wf && analysis) {
    await repo.updateWorkflow(wf.id, { approvalStatus: "pending" });
    await repo.updateJob(jobId, { rightsCleared: analysis.rightsConcerns.length === 0 });
    if (analysis.rightsConcerns.length) await requestApproval(jobId, "rights_clearance", "Clear rights concerns", analysis.rightsConcerns.join(" "), null, analysis.id);
    await requestApproval(jobId, "initial_workflow", "Approve workflow & maximum budget", `Plan v${wf.version} (reopened after rejection).`, wf.maxBudget, wf.id);
  }
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function promptFor(step: WorkflowStep, analysis: BriefView | null, attempt: number, extra?: string) {
  const parts = [
    step.purpose,
    step.inputs.length ? `Inputs: ${step.inputs.join("; ")}` : "",
    analysis ? `Brief: ${analysis.summary}` : "",
    analysis?.dimensions.length ? `Format: ${analysis.dimensions.join(", ")}` : "",
    analysis?.brandConstraints.length ? `Constraints: ${analysis.brandConstraints.slice(0, 3).join(" ")}` : "",
    step.category === "image" && analysis?.exactText.length && step.modelId === "ideogram-4" ? `Render text exactly: ${analysis.exactText.map((t) => `"${t}"`).join(" / ")}` : "",
    extra ?? "",
    `Take ${attempt}.`,
  ];
  return parts.filter(Boolean).join("\n");
}

export async function startProduction(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  assertWorkflowApproved(job, wf);
  if (job.status !== "approved") throw new GuardrailError("Production can only start from Approved.");
  await repo.updateJob(jobId, { status: "generating" });
  await log(jobId, "agent", "Started production inside the approved budget.");
  await tick(jobId);
}

/** The aspect ratio of the deliverable(s) a step serves, for models that take one. */
async function aspectRatioFor(jobId: string, step: WorkflowStep): Promise<string | null> {
  const brief = await getBrief(jobId);
  if (!brief) return null;
  const served = step.deliverableIds.length ? brief.deliverables.filter((d) => step.deliverableIds.includes(d.id)) : brief.deliverables;
  return served.find((d) => d.aspectRatio)?.aspectRatio ?? null;
}

/**
 * What an earlier step handed on: the picked image takes of the nearest finished step before this one, as
 * absolute URLs the provider can fetch. Steps are sequential, so this is how step N sees step N-1's work.
 */
function referencesFrom(wf: Workflow, gens: Generation[], step: WorkflowStep): { urls: string[]; from: WorkflowStep | null; note: string | null } {
  for (const prev of wf.steps.filter((s) => s.order < step.order && s.status === "done").sort((a, b) => b.order - a.order)) {
    const picks = gens.filter((g) => g.stepId === prev.id && !g.revisionId && g.status === "completed" && g.outputType === "image" && g.outputUrl);
    const chosen = picks.some((g) => g.selected) ? picks.filter((g) => g.selected) : picks.slice(0, 1);
    if (!chosen.length) continue;
    const urls: string[] = [];
    for (const g of chosen) {
      const u = g.outputUrl!;
      if (/^https?:\/\//.test(u)) urls.push(u);
      else if (config.publicBaseUrl && u.startsWith("/api/asset/")) urls.push(`${config.publicBaseUrl}${u}`);
    }
    return { urls, from: prev, note: urls.length ? null : "no public app URL is configured (set APP_URL), so the output could not be handed on" };
  }
  return { urls: [], from: null, note: null };
}

async function submitGeneration(job: Job, wf: Workflow, step: WorkflowStep, attempt: number, prompt: string, revisionId: string | null, estimate: number): Promise<"submitted" | "over_budget"> {
  const repo = getRepo();
  const gens = await repo.listGenerations(job.id);
  if (!fitsBudget(wf, gens, estimate)) return "over_budget";
  const model0 = getModel(step.modelId);
  const refs = referencesFrom(wf, gens, step);
  const takesImages = acceptsImageUrls(model0.request);
  const imageUrls = takesImages ? refs.urls : [];
  if (refs.from && attempt === 1 && !revisionId) {
    if (refs.note) await log(job.id, "system", `“${step.name}” could not use “${refs.from.name}”: ${refs.note}.`);
    else if (!takesImages) await log(job.id, "system", `${model0.label} takes no reference images, so “${refs.from.name}” was not sent; “${step.name}” runs from its prompt only.`);
    else await log(job.id, "agent", `“${step.name}” starts from ${imageUrls.length} output${imageUrls.length === 1 ? "" : "s"} of “${refs.from.name}”.`);
  }
  const provider = getProvider();
  const model = getModel(step.modelId);
  const gen: Generation = {
    id: newId("gen"),
    jobId: job.id,
    workflowId: wf.id,
    stepId: step.id,
    revisionId,
    attempt,
    provider: provider.name,
    providerRequestId: null,
    statusUrl: null,
    model: step.modelId,
    prompt,
    status: "queued",
    costEstimate: estimate,
    actualCost: null,
    outputUrl: null,
    outputType: null,
    selected: false,
    reviewStatus: "pending",
    reviewNote: null,
    error: null,
    timedOutAt: null,
    createdAt: now(),
    startedAt: now(),
    completedAt: null,
  };
  await repo.insertGeneration(gen);
  // Use the provider's cost estimate before paying, when it exposes one.
  if (provider.capabilities.estimate && provider.estimate) {
    try {
      const est = await provider.estimate({ generationId: gen.id, modelId: step.modelId, prompt, costEstimate: estimate });
      if (est.estimatedCost !== null && Math.abs(est.estimatedCost - estimate) >= 0.01) {
        await log(job.id, "agent", `${model.label}: provider estimate $${est.estimatedCost.toFixed(2)} vs catalog $${estimate.toFixed(2)} (budget uses the catalog figure).`);
      }
    } catch (err) {
      await log(job.id, "system", `Cost estimate unavailable: ${scrubSecrets((err as Error).message)}`);
    }
  }
  try {
    const r = await provider.submit({ generationId: gen.id, modelId: step.modelId, prompt, imageUrls, aspectRatio: await aspectRatioFor(job.id, step), costEstimate: estimate });
    await repo.updateGeneration(gen.id, { providerRequestId: r.providerRequestId, statusUrl: r.statusUrl, status: r.status });
    await log(job.id, "agent", `Submitted take ${attempt} of “${step.name}” on ${model.label} (${model.endpoint}); est. $${estimate.toFixed(2)}, request ${r.providerRequestId}.`);
    await audit({ jobId: job.id, kind: "generation", summary: `Submitted take ${attempt} of “${step.name}” on ${model.label}.`, costDeltaUsd: estimate });
  } catch (err) {
    // Failed submit is never charged (status "failed", actualCost 0). Scrub secrets.
    const reason = scrubSecrets((err as Error).message);
    await repo.updateGeneration(gen.id, { status: "failed", error: reason, completedAt: now(), actualCost: 0 });
    await log(job.id, "system", `Take ${attempt} of “${step.name}” could not be submitted: ${reason}`);
  }
  return "submitted";
}

async function blockForBudget(job: Job, wf: Workflow, step: WorkflowStep, needed: number) {
  const repo = getRepo();
  await repo.updateStep(step.id, { status: "blocked" });
  const spent = committedSpend(await repo.listGenerations(job.id));
  const proposed = Math.ceil(spent + needed);
  await requestApproval(
    job.id,
    "budget_increase",
    `Raise cap to $${proposed} to continue “${step.name}”`,
    `Committed spend $${spent.toFixed(2)} + $${needed.toFixed(2)} for remaining attempts exceeds the approved $${wf.maxBudget} cap. The agent has paused.`,
    proposed,
    step.id,
  );
  await audit({ jobId: job.id, kind: "escalation", summary: `Paused “${step.name}” — $${spent.toFixed(2)} committed + $${needed.toFixed(2)} needed exceeds the $${wf.maxBudget} cap.`, detail: "Requested a budget increase. The agent cannot spend past the approved cap." });
}

/** Advance production: poll in-flight work, then submit the next step if (and only if) it fits the cap. */
export async function tick(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job || job.status !== "generating") return;
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!wf || wf.approvalStatus !== "approved") return;
  const provider = getProvider();
  const analysis = await getBrief(jobId);

  // 1. poll in-flight work (and enforce the app-level timeout, which is tracked
  //    separately from the provider's status — never reported as a provider status).
  for (const g of (await repo.listGenerations(jobId)).filter((x) => (x.status === "queued" || x.status === "in_progress") && !x.timedOutAt)) {
    const elapsed = Date.now() - new Date(g.startedAt ?? g.createdAt).getTime();
    if (elapsed > config.generation.timeoutMs) {
      await repo.updateGeneration(g.id, { timedOutAt: now() });
      await log(jobId, "system", `Take ${g.attempt} on ${getModel(g.model).label} exceeded the ${Math.round(config.generation.timeoutMs / 60000)}-min polling limit; marked timed out (provider status left as ${g.status}). Not charged.`);
      continue;
    }
    try {
      const r = await provider.poll(g);
      const terminal = !["queued", "in_progress"].includes(r.status);
      let outputUrl = g.outputUrl;
      let outputType = g.outputType;
      if (r.status === "completed" && r.asset) {
        const persisted = await persistAsset(jobId, g.id, r.asset);
        outputUrl = persisted.storedUrl;
        outputType = r.asset.kind;
        if (persisted.note) await log(jobId, "system", `Could not copy output to app storage (${persisted.note}); using the provider URL, which may expire.`);
      }
      if (r.status !== g.status || outputUrl !== g.outputUrl) {
        await repo.updateGeneration(g.id, {
          status: r.status,
          outputUrl,
          outputType,
          actualCost: r.actualCost !== undefined ? r.actualCost : g.actualCost,
          error: r.error ? scrubSecrets(r.error) : null,
          completedAt: terminal ? now() : null,
        });
        if (terminal) {
          const cost = r.status === "completed" ? (r.actualCost ?? g.costEstimate) : 0;
          await log(jobId, "agent", `Take ${g.attempt} ${r.status}${r.status === "completed" ? ` · recorded $${cost.toFixed(2)}` : ""}.`);
        }
      }
    } catch (err) {
      await repo.updateGeneration(g.id, { error: `Poll error: ${scrubSecrets((err as Error).message)}` });
    }
  }

  // 2. settle steps + revisions
  let gens = await repo.listGenerations(jobId);
  // Timed-out generations are no longer "in flight" for settling purposes.
  const inFlight = (xs: Generation[]) => xs.some((g) => (g.status === "queued" || g.status === "in_progress") && !g.timedOutAt);
  for (const step of wf.steps.filter((s) => s.status === "running")) {
    const sg = gens.filter((g) => g.stepId === step.id && !g.revisionId);
    if (inFlight(sg)) continue;
    const completed = sg.filter((g) => g.status === "completed");
    if (completed.length) {
      await repo.updateStep(step.id, { status: "done" });
      if (!completed.some((g) => g.selected)) await repo.updateGeneration(completed[0].id, { selected: true });
      await log(jobId, "agent", `“${step.name}” finished: ${completed.length}/${sg.length} attempts usable.`);
    } else if (sg.length < step.estimatedAttempts + MAX_AUTO_RETRIES) {
      const r = await submitGeneration(job, wf, step, sg.length + 1, promptFor(step, analysis, sg.length + 1, "Retry after failure."), null, step.unitCost);
      if (r === "over_budget") await blockForBudget(job, wf, step, step.unitCost);
      else await log(jobId, "agent", `All attempts failed on “${step.name}”; retrying within budget.`);
    } else {
      await repo.updateStep(step.id, { status: "failed" });
      const lastError = [...sg].reverse().find((g) => g.error)?.error;
      await log(jobId, "agent", `“${step.name}” failed after retries. Needs operator attention.${lastError ? ` Last error: ${lastError}` : ""}`);
    }
  }
  for (const rev of (await repo.listRevisions(jobId)).filter((r) => r.runStatus === "running")) {
    const rg = (await repo.listGenerations(jobId)).filter((g) => g.revisionId === rev.id);
    if (!inFlight(rg)) {
      await repo.updateRevision(rev.id, { runStatus: "done" });
      const best = rg.find((g) => g.status === "completed");
      if (best) await repo.updateGeneration(best.id, { selected: true });
      await log(jobId, "agent", `Revision applied: ${rev.actionSummary}`);
    }
  }

  // 3. start the next pending step (sequential — each step feeds the next)
  const fresh = (await repo.getCurrentWorkflow(jobId))!;
  gens = await repo.listGenerations(jobId);
  const running = fresh.steps.some((s) => s.status === "running");
  const blocked = fresh.steps.some((s) => s.status === "blocked" || s.status === "failed");
  if (!running && !blocked) {
    const next = fresh.steps.find((s) => s.status === "pending");
    if (next && stepAwaitingReview(fresh, gens, next)) {
      // Wait for the operator to approve a take of the finished step; approving it releases the next step.
    } else if (next) {
      const needed = next.unitCost * next.estimatedAttempts;
      if (!fitsBudget(fresh, gens, needed)) {
        await blockForBudget(job, fresh, next, needed);
      } else {
        await repo.updateStep(next.id, { status: "running" });
        for (let i = 1; i <= next.estimatedAttempts; i++) {
          await submitGeneration(job, fresh, next, i, promptFor(next, analysis, i), null, next.unitCost);
        }
        await log(jobId, "agent", `Submitted ${next.estimatedAttempts} attempts for “${next.name}” on ${getModel(next.modelId).label}.`);
      }
    }
  }

  // 4. all done → QA + final delivery gate
  const end = (await repo.getCurrentWorkflow(jobId))!;
  const endGens = await repo.listGenerations(jobId);
  const allStepsDone = end.steps.every((s) => s.status === "done" || s.status === "skipped");
  const revisionsRunning = (await repo.listRevisions(jobId)).some((r) => r.runStatus === "running");
  if (allStepsDone && !inFlight(endGens) && !revisionsRunning) {
    await repo.updateJob(jobId, { status: "qa" });
    await log(jobId, "agent", "Production complete. Moved to QA for human review.");
    await audit({ jobId, kind: "decision", summary: "Production complete → moved to QA. Final delivery awaits human approval." });
    await requestApproval(jobId, "final_delivery", "Approve final delivery", "Review outputs. Delivery to the client is done by you, outside Studio Operator.", null, null);
  }
}

export async function tickAllGenerating() {
  for (const j of (await getRepo().listJobs()).filter((x) => x.status === "generating")) await tick(j.id);
}

export async function approveBudgetIncrease(jobId: string, approvalId: string, newCap: number) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  const ap = await repo.getApproval(approvalId);
  if (!job || !wf || !ap || ap.status !== "pending") throw new GuardrailError("Approval not found or already decided.");
  if (newCap <= wf.maxBudget) throw new GuardrailError("New cap must be higher than the current cap.");
  if (newCap > job.budget) throw new GuardrailError("Cap cannot exceed the client price.");
  await repo.transaction(async () => {
    await repo.updateWorkflow(wf.id, { maxBudget: newCap });
    await repo.updateApproval(approvalId, { amount: newCap });
    await decideApproval(approvalId, "approved", config.operatorName);
    if (ap.refId) {
      const step = wf.steps.find((s) => s.id === ap.refId);
      if (step?.status === "blocked") await repo.updateStep(step.id, { status: step && (await repo.listGenerations(jobId)).some((g) => g.stepId === step.id) ? "running" : "pending" });
      const rev = await repo.getRevision(ap.refId);
      if (rev) await repo.updateRevision(rev.id, { approvalStatus: "approved" });
    }
    await log(jobId, "operator", `Raised generation cap from $${wf.maxBudget} to $${newCap}.`);
    await audit({ jobId, kind: "approval", actor: "operator", summary: `Raised generation cap from $${wf.maxBudget} to $${newCap}.` });
  });
  await tick(jobId);
}

export async function decideGenericApproval(jobId: string, approvalId: string, status: "approved" | "rejected") {
  const repo = getRepo();
  const ap = await repo.getApproval(approvalId);
  if (!ap || ap.status !== "pending") throw new GuardrailError("Approval not found or already decided.");
  await repo.transaction(async () => {
    await decideApproval(approvalId, status, config.operatorName);
    const rev = ap.refId ? await repo.getRevision(ap.refId) : null;
    if (rev) await repo.updateRevision(rev.id, { approvalStatus: status });
    await log(jobId, "operator", `${status === "approved" ? "Approved" : "Declined"}: ${ap.title}`);
  });
}

/** Store a new plan estimate. Approved plans keep their cap; unapproved ones re-propose it and refresh the pending approval. */
async function applyTotal(job: Job, wf: Workflow, total: number) {
  const repo = getRepo();
  if (wf.approvalStatus === "approved") {
    await repo.updateWorkflow(wf.id, { estimatedTotalCost: total });
    return;
  }
  const maxBudget = Math.ceil(total * (1 + job.contingencyPct));
  await repo.updateWorkflow(wf.id, { estimatedTotalCost: total, maxBudget });
  for (const a of (await repo.listApprovals(job.id)).filter((x) => x.status === "pending" && x.kind === "initial_workflow" && x.refId === wf.id)) {
    await repo.updateApproval(a.id, { amount: maxBudget, reason: `Plan v${wf.version} with ${wf.steps.length} steps. Estimated spend $${total.toFixed(2)}.` });
  }
}

export interface StepEdit {
  name: string;
  purpose: string;
  inputs: string[];
  expectedOutputs: string[];
  modelId: string;
  estimatedAttempts: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The operator edits a step that has not started: its name, the prompt text (purpose), inputs, expected
 * outputs, the model, and the number of attempts. Text edits are free; a model or attempts change reprices the
 * plan. Before approval the cap is re-proposed; after approval the new total must still fit under the approved
 * cap, otherwise the change is refused (raise the cap through a budget approval first).
 */
export type StepSaveMode = "save" | "retry" | "rerun";

export async function updateStep(jobId: string, stepId: string, edit: StepEdit, mode: StepSaveMode = "save") {
  const retry = mode === "retry";
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job || !wf) throw new GuardrailError("No production plan exists for this job.");
  if (wf.approvalStatus === "superseded" || wf.approvalStatus === "rejected" || ["rejected", "delivered"].includes(job.status)) {
    throw new GuardrailError("This plan can no longer be edited.");
  }
  const step = wf.steps.find((x) => x.id === stepId);
  if (!step) throw new GuardrailError("Step not found.");
  if (!(mode === "rerun" ? ["done"] : ["pending", "failed", "blocked"]).includes(step.status)) {
    throw new GuardrailError(mode === "rerun" ? "Only a finished step can be re-run." : "Only steps that have not started, or that failed or are paused, can be edited.");
  }
  if (retry && step.status !== "failed") throw new GuardrailError("Only a failed step can be retried after editing.");
  if (mode === "rerun" && !["approved", "generating", "qa"].includes(job.status)) throw new GuardrailError("Production has not started.");

  const name = edit.name.trim();
  const purpose = edit.purpose.trim();
  if (!name) throw new GuardrailError("Give the step a name.");
  if (!purpose) throw new GuardrailError("The step needs a prompt / purpose — it is what the model is asked to make.");
  const model = MODEL_CATALOG.find((m) => m.id === edit.modelId);
  if (!model) throw new GuardrailError("Unknown model.");
  if (model.category !== step.category) throw new GuardrailError(`This step is ${step.category}; pick a ${step.category} model.`);
  const attempts = Math.floor(edit.estimatedAttempts);
  if (!Number.isFinite(attempts) || attempts < 1 || attempts > config.economics.maxAttemptsPerStep) {
    throw new GuardrailError(`Attempts must be between 1 and ${config.economics.maxAttemptsPerStep}.`);
  }
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

  const unitCost = model.id === step.modelId ? step.unitCost : model.unitCostUsd;
  const stepCost = round2(unitCost * attempts);
  const total = round2(wf.steps.reduce((a, x) => a + (x.id === step.id ? stepCost : x.estimatedTotalCost), 0));
  const repriced = stepCost !== step.estimatedTotalCost;
  if (wf.approvalStatus === "approved" && total > wf.maxBudget) {
    throw new GuardrailError(`The new estimate ($${total.toFixed(2)}) exceeds the approved cap ($${wf.maxBudget}). Raise the cap first, or choose a cheaper model or fewer attempts.`);
  }

  await repo.transaction(async () => {
    await repo.updateStep(step.id, {
      name,
      purpose,
      inputs: list(edit.inputs),
      expectedOutputs: list(edit.expectedOutputs),
      modelId: model.id,
      unitCost,
      estimatedAttempts: attempts,
      estimatedTotalCost: stepCost,
    });
    if (!repriced) return;
    await applyTotal(job, wf, total);
    await audit({ jobId, kind: "cost_change", actor: "operator", summary: `Edited “${name}”: ${model.label}, ${attempts} attempt${attempts === 1 ? "" : "s"}; plan estimate now $${total.toFixed(2)}.`, costDeltaUsd: round2(total - wf.estimatedTotalCost) });
  });
  await log(jobId, "operator", `Edited step ${step.order} “${name}”${model.id !== step.modelId ? ` (model → ${model.label})` : ""}.`);
  if (retry) await retryStep(jobId, stepId);
  if (mode === "rerun") await restartFrom(jobId, stepId);
}

/**
 * Re-run a finished step: it and every later step go back to pending, their earlier takes stay as history
 * but lose their approval, and the next tick runs the step again. Refused while a later step is in flight
 * or when the re-run does not fit under the approved cap.
 */
async function restartFrom(jobId: string, stepId: string) {
  const repo = getRepo();
  const job = (await repo.getJob(jobId))!;
  const wf = (await repo.getCurrentWorkflow(jobId))!;
  const step = wf.steps.find((s) => s.id === stepId)!;
  if (wf.approvalStatus !== "approved" || !["generating", "qa"].includes(job.status)) throw new GuardrailError("Production is not running, so there is nothing to re-run.");
  const later = wf.steps.filter((s) => s.order >= step.order);
  if (later.some((s) => s.status === "running")) throw new GuardrailError("Wait for the running step to finish before re-running an earlier one.");
  const gens = await repo.listGenerations(jobId);
  const needed = step.unitCost * step.estimatedAttempts;
  if (!fitsBudget(wf, gens, needed)) {
    throw new GuardrailError(`Re-running needs about $${needed.toFixed(2)} more; committed spend is $${committedSpend(gens).toFixed(2)} of the $${wf.maxBudget} cap. Raise the cap first.`);
  }
  await repo.transaction(async () => {
    const ids = new Set(later.map((s) => s.id));
    for (const s of later) await repo.updateStep(s.id, { status: "pending" });
    for (const g of gens.filter((x) => ids.has(x.stepId) && !x.revisionId && (x.selected || x.reviewStatus !== "pending"))) {
      await repo.updateGeneration(g.id, { selected: false, reviewStatus: "pending", reviewNote: null });
    }
    for (const a of (await repo.listApprovals(jobId)).filter((x) => x.status === "pending" && x.kind === "final_delivery")) {
      await repo.updateApproval(a.id, { status: "rejected", decidedBy: "system", decidedAt: now(), reason: a.reason + " (superseded by a re-run)" });
    }
    await repo.updateJob(jobId, { status: "generating" });
  });
  await log(jobId, "operator", `Re-running from step ${step.order} “${step.name}”${later.length > 1 ? `; ${later.length - 1} later step${later.length === 2 ? "" : "s"} reset` : ""}.`);
  await audit({ jobId, kind: "decision", actor: "operator", summary: `Re-ran from “${step.name}” (step ${step.order}); later steps reset to pending.` });
  await tick(jobId);
}

/** Whether a finished step needs the operator's approval before the next step starts. */
export async function setStepReview(jobId: string, stepId: string, requiresReview: boolean) {
  const { repo, wf } = await editablePlan(jobId);
  const step = wf.steps.find((s) => s.id === stepId);
  if (!step) throw new GuardrailError("Step not found.");
  await repo.updateStep(stepId, { requiresReview });
  await log(jobId, "operator", `${requiresReview ? "Now requiring" : "No longer requiring"} approval of “${step.name}” before the next step.`);
  if (!requiresReview) await tick(jobId);
}

export async function retryStep(jobId: string, stepId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  assertWorkflowApproved(job, wf);
  const step = wf.steps.find((s) => s.id === stepId);
  if (!step || step.status !== "failed") throw new GuardrailError("Only failed steps can be retried.");
  await repo.updateStep(stepId, { status: "running" });
  const r = await submitGeneration(job, wf, step, (await repo.listGenerations(jobId)).filter((g) => g.stepId === stepId).length + 1, promptFor(step, await getBrief(jobId), 99, "Operator-requested retry."), null, step.unitCost);
  if (r === "over_budget") await blockForBudget(job, wf, step, step.unitCost);
  if (job.status !== "generating") await repo.updateJob(jobId, { status: "generating" });
  await log(jobId, "operator", `Retried “${step.name}”.`);
}

export async function toggleSelect(generationId: string) {
  const repo = getRepo();
  const g = await repo.getGeneration(generationId);
  if (!g || g.status !== "completed") throw new GuardrailError("Only completed outputs can be selected.");
  await repo.updateGeneration(g.id, { selected: !g.selected });
}

/**
 * Record the operator's verdict on a completed take. Approving puts it in the delivery set,
 * rejecting takes it out, and "pending" resets both. A rejection may carry a reason that
 * later revisions and retries can learn from.
 */
export async function reviewGeneration(jobId: string, generationId: string, status: TakeReview, note: string | null) {
  const repo = getRepo();
  const g = await repo.getGeneration(generationId);
  if (!g || g.jobId !== jobId) throw new GuardrailError("Generation not found.");
  if (g.status !== "completed") throw new GuardrailError("Only completed outputs can be reviewed.");
  if (!(TAKE_REVIEWS as readonly string[]).includes(status)) throw new GuardrailError("Unknown review status.");
  const trimmed = note?.trim().slice(0, 500) || null;
  await repo.updateGeneration(g.id, {
    reviewStatus: status,
    reviewNote: status === "pending" ? null : trimmed,
    selected: status === "approved",
  });
}

/**
 * Ask the provider to cancel a generation. Only allowed while the request is
 * still queued, and only when the current provider exposes a cancel action.
 */
export async function cancelGeneration(jobId: string, generationId: string) {
  const repo = getRepo();
  const g = await repo.getGeneration(generationId);
  if (!g || g.jobId !== jobId) throw new GuardrailError("Generation not found.");
  if (g.status !== "queued") throw new GuardrailError("Only queued generations can be cancelled.");
  const provider = getProvider();
  if (!provider.capabilities.cancel || !provider.cancel) throw new GuardrailError("This provider does not expose a cancel action.");
  try {
    const r = await provider.cancel(g);
    await repo.updateGeneration(g.id, { status: r.status ?? "canceled", actualCost: 0, completedAt: now(), error: null });
    await log(jobId, "operator", `Cancelled take ${g.attempt} on ${getModel(g.model).label}. Not charged.`);
  } catch (err) {
    throw new GuardrailError(scrubSecrets((err as Error).message));
  }
}

/**
 * Retry a failed / timed-out / cancelled generation. This always creates a NEW
 * generation record for the same step; the failed attempt is never overwritten.
 */
export async function retryGeneration(jobId: string, generationId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  const g = await repo.getGeneration(generationId);
  if (!job || !g || g.jobId !== jobId) throw new GuardrailError("Generation not found.");
  assertWorkflowApproved(job, wf);
  const retryable = g.status === "failed" || g.status === "nsfw" || g.status === "canceled" || !!g.timedOutAt;
  if (!retryable) throw new GuardrailError("Only failed, timed-out or cancelled generations can be retried.");
  const step = wf.steps.find((s) => s.id === g.stepId);
  if (!step) throw new GuardrailError("Original step no longer exists.");
  const attempt = (await repo.listGenerations(jobId)).filter((x) => x.stepId === step.id).length + 1;
  if (job.status !== "generating") await repo.updateJob(jobId, { status: "generating" });
  if (step.status === "failed" || step.status === "blocked") await repo.updateStep(step.id, { status: "running" });
  const r = await submitGeneration(job, wf, step, attempt, promptFor(step, await getBrief(jobId), attempt, "Operator-requested retry of a prior attempt."), g.revisionId, step.unitCost);
  if (r === "over_budget") await blockForBudget(job, wf, step, step.unitCost);
  await log(jobId, "operator", `Retried take ${g.attempt} as a new attempt on “${step.name}”.`);
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export async function addRevision(jobId: string, note: string, deliverable: string | null) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job || !wf) throw new GuardrailError("Job not found.");
  if (job.status !== "qa") throw new GuardrailError("Revision notes are collected while the job is in QA.");
  if (!note.trim()) throw new GuardrailError("Revision note is empty.");
  const plan = planRevision(note, await getBrief(jobId), deliverable);
  const spent = committedSpend(await repo.listGenerations(jobId));
  const reservedForApproved = (await repo
    .listRevisions(jobId))
    .filter((r) => r.approvalStatus === "approved" && r.runStatus === "not_started")
    .reduce((a, r) => a + r.expectedIncrementalCost, 0);
  const remaining = wf.maxBudget - spent - reservedForApproved;

  let requiresApproval = false;
  let approvalReason: string | null = null;
  let kind: ApprovalKind | null = null;
  if (plan.materialChange) {
    requiresApproval = true;
    kind = "workflow_change";
    approvalReason = "Material change to the approved scope.";
  } else if (plan.recommendedAction === "clarify") {
    requiresApproval = false;
  } else if (plan.expectedIncrementalCost > remaining) {
    requiresApproval = true;
    kind = "budget_increase";
    approvalReason = `Needs $${plan.expectedIncrementalCost.toFixed(2)}; only $${Math.max(0, remaining).toFixed(2)} left under the cap.`;
  }

  const rev: Revision = {
    id: newId("rv"),
    jobId,
    clientNote: note.trim(),
    ...plan,
    requiresApproval,
    approvalReason,
    approvalStatus: requiresApproval ? "pending" : plan.recommendedAction === "clarify" ? "draft" : "approved",
    runStatus: "not_started",
    createdAt: now(),
  };
  await repo.transaction(async () => {
    await repo.insertRevision(rev);
    await log(jobId, "operator", `Logged client note: “${rev.clientNote.slice(0, 80)}”`);
    if (kind === "workflow_change") {
      await requestApproval(jobId, "workflow_change", "Approve scope change", `${rev.actionSummary} Client note: “${rev.clientNote}”`, null, rev.id);
    } else if (kind === "budget_increase") {
      await requestApproval(jobId, "budget_increase", `Raise cap to $${Math.ceil(spent + reservedForApproved + plan.expectedIncrementalCost)} for revision`, approvalReason!, Math.ceil(spent + reservedForApproved + plan.expectedIncrementalCost), rev.id);
    } else if (rev.approvalStatus === "approved") {
      await log(jobId, "agent", `Revision fits remaining budget ($${remaining.toFixed(2)}); auto-approved within limits.`);
    }
  });
  return rev.id;
}

export async function runRevision(jobId: string, revisionId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  const rev = await repo.getRevision(revisionId);
  if (!job || !rev) throw new GuardrailError("Revision not found.");
  assertWorkflowApproved(job, wf);
  if (rev.approvalStatus !== "approved") throw new GuardrailError("Revision is not approved.");
  if (rev.materialChange) throw new GuardrailError("Scope changes are re-planned and re-quoted, not run as revisions.");
  if (!rev.modelId || rev.attempts === 0) throw new GuardrailError("This revision has no generation work.");
  if (rev.runStatus !== "not_started") throw new GuardrailError("Revision already run.");
  const step = wf.steps.find((s) => s.modelId === rev.modelId) ?? wf.steps.find((s) => getModel(s.modelId).category === getModel(rev.modelId!).category) ?? wf.steps[wf.steps.length - 1];
  const unit = getModel(rev.modelId).unitCostUsd;
  if (!fitsBudget(wf, await repo.listGenerations(jobId), unit * rev.attempts)) {
    throw new GuardrailError("Revision would exceed the approved cap. Request a budget increase.");
  }
  await repo.updateRevision(rev.id, { runStatus: "running" });
  await repo.updateJob(jobId, { status: "generating" });
  for (const a of (await repo.listApprovals(jobId)).filter((x) => x.kind === "final_delivery" && x.status === "pending")) {
    await repo.updateApproval(a.id, { status: "rejected", decidedBy: "system", decidedAt: now(), reason: "Superseded — revision in progress." });
  }
  const pseudoStep: WorkflowStep = { ...step, modelId: rev.modelId, unitCost: unit, purpose: rev.actionSummary };
  for (let i = 1; i <= rev.attempts; i++) {
    await submitGeneration(job, wf, pseudoStep, i, promptFor(pseudoStep, await getBrief(jobId), i, `Client note: ${rev.clientNote}`), rev.id, unit);
  }
  await log(jobId, "agent", `Running revision: ${rev.actionSummary}`);
}

export async function approveFinalDelivery(jobId: string, attestation: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  if (!job || job.status !== "qa") throw new GuardrailError("Only jobs in QA can be approved for delivery.");
  const pending = (await repo.listApprovals(jobId)).filter((a) => a.status === "pending");
  const delivery = pending.find((a) => a.kind === "final_delivery");
  const blocking = pending.filter((a) => a.kind !== "final_delivery");
  if (!delivery) throw new GuardrailError("No final delivery approval is pending.");
  if (blocking.length) throw new GuardrailError(`Resolve ${blocking.length} other pending approval(s) first.`);
  if ((await repo.listRevisions(jobId)).some((r) => r.approvalStatus === "approved" && r.runStatus !== "done" && r.modelId)) {
    throw new GuardrailError("There are approved revisions that have not been run.");
  }
  const selected = (await repo.listGenerations(jobId)).filter((g) => g.selected);
  if (selected.length === 0) throw new GuardrailError("Select at least one output for delivery.");
  await repo.transaction(async () => {
    await decideApproval(delivery.id, "approved", config.operatorName);
    await repo.updateJob(jobId, { status: "delivered", deliveredAt: now() });
    await log(jobId, "operator", `Approved final delivery (${selected.length} selected outputs). ${attestation}`);
    await audit({ jobId, kind: "approval", actor: "operator", summary: `Approved final delivery (${selected.length} selected outputs).` });
  });
}

export function profitabilityFor(bundle: JobBundle) {
  return computeProfitability(bundle.job, bundle.workflow, bundle.generations, bundle.revisions);
}

// ---------------------------------------------------------------------------
// Provider connection test (Connection Test screen). Returns only non-secret
// data; any detail string is scrubbed of credentials.
// ---------------------------------------------------------------------------

export function providerInfo() {
  const p = getProvider();
  return { name: p.name, live: p.live, capabilities: p.capabilities, baseUrl: config.higgsfield.baseUrl, wireEnabled: config.higgsfield.wireEnabled };
}

/** What the app is about to send to Higgsfield, described without revealing it: source, length and last four characters. */
function higgsfieldKeyDiagnostics(): string {
  const status = secretStatus();
  const describe = (name: "hfApiKeyId" | "hfApiKeySecret", label: string, value: string) => {
    const row = status.find((s) => s.name === name);
    const shape = describeKeyShape(value);
    const source = row?.source === "settings" ? "saved in Settings" : row?.source === "environment" ? "from the environment" : "not set";
    const flags = [shape.hasColon ? "contains ':'" : "", shape.hasWhitespace ? "contains whitespace" : "", shape.hasQuote ? "contains quotes" : ""].filter(Boolean);
    const tail = row?.hint?.replace(/•/g, "");
    return `${label}: ${shape.length} characters, ${source}${tail ? `, ends ${tail}` : ""}${flags.length ? ` (${flags.join(", ")})` : ""}`;
  };
  return `${describe("hfApiKeyId", "Key ID", config.higgsfield.apiKeyId)}. ${describe("hfApiKeySecret", "Secret", config.higgsfield.apiKeySecret)}.`;
}

export async function providerConnectionTest(): Promise<{ ok: boolean; detail: string; name: string; live: boolean }> {
  const p = getProvider();
  try {
    const r = await p.connectionTest();
    const detail = p.name === "higgsfield" ? `${r.detail} ${higgsfieldKeyDiagnostics()}` : r.detail;
    return { ok: r.ok, detail: scrubSecrets(detail), name: p.name, live: p.live };
  } catch (err) {
    return { ok: false, detail: scrubSecrets((err as Error).message), name: p.name, live: p.live };
  }
}

async function editablePlan(jobId: string) {
  const repo = getRepo();
  const job = await repo.getJob(jobId);
  const wf = await repo.getCurrentWorkflow(jobId);
  if (!job || !wf) throw new GuardrailError("No production plan exists for this job.");
  if (wf.approvalStatus === "superseded" || wf.approvalStatus === "rejected" || ["rejected", "delivered"].includes(job.status)) {
    throw new GuardrailError("This plan can no longer be edited.");
  }
  return { repo, job, wf };
}

/** Steps that have begun keep their place; new steps go after them. */
const lastStartedOrder = (wf: Workflow) => wf.steps.filter((s) => s.status !== "pending").reduce((a, s) => Math.max(a, s.order), 0);

export interface NewStep {
  afterOrder: number; // 0 = first
  name: string;
  modelId: string;
  purpose: string;
  estimatedAttempts: number;
}

/** Add a step to a plan. It must come after every step that has already started, and (once approved) fit under the cap. */
export async function addStep(jobId: string, input: NewStep) {
  const { repo, job, wf } = await editablePlan(jobId);
  const model = MODEL_CATALOG.find((m) => m.id === input.modelId);
  if (!model) throw new GuardrailError("Unknown model.");
  const name = input.name.trim();
  const purpose = input.purpose.trim();
  if (!name || !purpose) throw new GuardrailError("A step needs a name and a prompt / purpose.");
  const attempts = Math.floor(input.estimatedAttempts);
  if (!Number.isFinite(attempts) || attempts < 1 || attempts > config.economics.maxAttemptsPerStep) {
    throw new GuardrailError(`Attempts must be between 1 and ${config.economics.maxAttemptsPerStep}.`);
  }
  const at = Math.max(Math.floor(input.afterOrder), lastStartedOrder(wf)) + 1;
  const stepCost = round2(model.unitCostUsd * attempts);
  const total = round2(wf.estimatedTotalCost + stepCost);
  if (wf.approvalStatus === "approved" && total > wf.maxBudget) {
    throw new GuardrailError(`Adding this step makes the estimate $${total.toFixed(2)}, above the approved cap ($${wf.maxBudget}). Raise the cap first.`);
  }
  await repo.transaction(async () => {
    for (const s of wf.steps.filter((x) => x.order >= at)) await repo.updateStep(s.id, { order: s.order + 1 });
    await repo.insertStep({
      id: newId("st"),
      workflowId: wf.id,
      order: at,
      name,
      category: model.category,
      modelId: model.id,
      purpose,
      inputs: [],
      expectedOutputs: [],
      deliverableIds: [],
      estimatedAttempts: attempts,
      unitCost: model.unitCostUsd,
      estimatedTotalCost: stepCost,
      status: "pending",
      requiresReview: true,
    });
    await applyTotal(job, wf, total);
    await audit({ jobId, kind: "cost_change", actor: "operator", summary: `Added step “${name}” on ${model.label}; plan estimate now $${total.toFixed(2)}.`, costDeltaUsd: stepCost });
  });
  await log(jobId, "operator", `Added step ${at} “${name}”.`);
}

/** Remove a step that has not started. */
export async function removeStep(jobId: string, stepId: string) {
  const { repo, job, wf } = await editablePlan(jobId);
  const step = wf.steps.find((s) => s.id === stepId);
  if (!step) throw new GuardrailError("Step not found.");
  if (step.status !== "pending") throw new GuardrailError("Only steps that have not started can be removed.");
  if (wf.steps.length <= 1) throw new GuardrailError("A plan needs at least one step.");
  const total = round2(wf.estimatedTotalCost - step.estimatedTotalCost);
  await repo.transaction(async () => {
    await repo.deleteStep(step.id);
    for (const s of wf.steps.filter((x) => x.order > step.order)) await repo.updateStep(s.id, { order: s.order - 1 });
    await applyTotal(job, wf, total);
    await audit({ jobId, kind: "cost_change", actor: "operator", summary: `Removed step “${step.name}”; plan estimate now $${total.toFixed(2)}.`, costDeltaUsd: -step.estimatedTotalCost });
  });
  await log(jobId, "operator", `Removed step ${step.order} “${step.name}”.`);
}

/** Approve a finished step's takes (its picked ones, else its first usable one) so the next step can start. */
export async function approveStepOutput(jobId: string, stepId: string) {
  const repo = getRepo();
  const wf = await repo.getCurrentWorkflow(jobId);
  const step = wf?.steps.find((s) => s.id === stepId);
  if (!wf || !step) throw new GuardrailError("Step not found.");
  if (step.status !== "done") throw new GuardrailError("The step has not finished yet.");
  const takes = (await repo.listGenerations(jobId)).filter((g) => g.stepId === stepId && !g.revisionId && g.status === "completed");
  if (!takes.length) throw new GuardrailError("There are no usable takes to approve — retry the step.");
  const picks = takes.some((g) => g.selected) ? takes.filter((g) => g.selected) : takes.slice(0, 1);
  for (const g of picks) await repo.updateGeneration(g.id, { reviewStatus: "approved", selected: true });
  await log(jobId, "operator", `Approved ${picks.length} take${picks.length === 1 ? "" : "s"} of “${step.name}”; the next step may start.`);
  await tick(jobId);
}
