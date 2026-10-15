import "server-only";
import { analyzeBrief } from "@/lib/ai/brief-analyzer";
import { config, scrubSecrets } from "@/lib/config";
import { persistAsset } from "@/lib/higgsfield/asset-store";
import type {
  ApprovalKind,
  ApprovalRequest,
  BriefAnalysis,
  Generation,
  Job,
  JobBundle,
  JobSource,
  Revision,
  Workflow,
  WorkflowStep,
} from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import { getProvider } from "@/lib/higgsfield/provider";
import { getRepo } from "@/lib/repo";
import { decide } from "./decision";
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
import { runIntakeAnalysis } from "./intake";
import { buildWorkflow } from "./planner";
import { planRevision } from "./revisions";

const now = () => new Date().toISOString();
const MAX_AUTO_RETRIES = 2;

function log(jobId: string, actor: "operator" | "agent" | "system", message: string) {
  getRepo().insertActivity({ id: newId("ev"), jobId, actor, message, createdAt: now() });
}

function requestApproval(jobId: string, kind: ApprovalKind, title: string, reason: string, amount: number | null, refId: string | null) {
  const repo = getRepo();
  const existing = repo.listApprovals(jobId).find((a) => a.kind === kind && a.status === "pending" && a.refId === refId);
  if (existing) return existing;
  const a: ApprovalRequest = { id: newId("ap"), jobId, kind, status: "pending", title, reason, amount, refId, decidedBy: null, decidedAt: null, createdAt: now() };
  repo.insertApproval(a);
  log(jobId, "agent", `Requested human approval: ${title}`);
  return a;
}

function decideApproval(id: string, status: "approved" | "rejected", by: string) {
  getRepo().updateApproval(id, { status, decidedBy: by, decidedAt: now() });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getBundle(jobId: string): JobBundle | null {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job) return null;
  return {
    job,
    analysis: repo.getLatestAnalysis(jobId),
    intake: repo.getLatestIntakeAnalysis(jobId),
    workflow: repo.getCurrentWorkflow(jobId),
    generations: repo.listGenerations(jobId),
    revisions: repo.listRevisions(jobId),
    approvals: repo.listApprovals(jobId),
    activity: repo.listActivity(jobId),
  };
}

export function getDashboard() {
  const repo = getRepo();
  const jobs = repo.listJobs();
  const analyses = new Map(repo.listLatestAnalyses().map((a) => [a.jobId, a]));
  const workflows = new Map(repo.listCurrentWorkflows().map((w) => [w.jobId, w]));
  const approvals = repo.listApprovals();
  return jobs.map((job) => {
    const workflow = workflows.get(job.id) ?? null;
    const generations = repo.listGenerations(job.id);
    const revisions = repo.listRevisions(job.id);
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
    deliveredAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  repo.insertJob(job);
  log(job.id, "operator", `Brief pasted from ${input.source}. Client price $${input.budget}.`);
  // Real structured intake analysis (OpenAI Responses / mock) + deterministic decision.
  try {
    await runIntakeAnalysis(job);
  } catch (err) {
    log(job.id, "system", `Intake analysis could not be stored: ${(err as Error).message}`);
  }
  await analyzeAndPlan(job.id);
  return job.id;
}

export async function analyzeAndPlan(jobId: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  const current = repo.getCurrentWorkflow(jobId);
  if (current && current.approvalStatus === "approved") {
    throw new GuardrailError("This job already has an approved workflow. Re-planning would be a material change — raise a revision instead.");
  }

  const { draft, warning } = await analyzeBrief({
    rawBrief: job.rawBrief,
    budget: job.budget,
    deadline: job.deadline,
    source: job.source,
    referenceAssets: job.referenceAssets,
    clientNotes: job.clientNotes,
  });
  if (warning) log(jobId, "system", warning);

  repo.transaction(() => {
    const analysis: BriefAnalysis = {
      id: newId("an"),
      jobId,
      analyzer: draft.analyzer,
      summary: draft.summary,
      deliverables: draft.deliverables,
      dimensions: draft.dimensions,
      durations: draft.durations,
      references: draft.references,
      exactText: draft.exactText,
      brandConstraints: draft.brandConstraints,
      rightsConcerns: draft.rightsConcerns,
      missingInformation: draft.missingInformation,
      confidence: draft.confidence,
      decision: "review",
      rationale: [],
      estimatedShots: draft.estimatedShots,
      createdAt: now(),
    };
    const version = (current?.version ?? 0) + 1;
    const workflow = buildWorkflow(analysis, jobId, version, job.contingencyPct);
    const { decision, rationale } = decide(job, draft, workflow, config.economics);
    analysis.decision = decision;
    analysis.rationale = rationale;
    repo.insertAnalysis(analysis);

    if (current) repo.updateWorkflow(current.id, { approvalStatus: "superseded" });
    for (const a of repo.listApprovals(jobId).filter((x) => x.status === "pending" && (x.kind === "initial_workflow" || x.kind === "rights_clearance"))) {
      repo.updateApproval(a.id, { status: "rejected", decidedBy: "system", decidedAt: now(), reason: a.reason + " (superseded by re-analysis)" });
    }
    workflow.approvalStatus = decision === "reject" ? "draft" : "pending";
    repo.insertWorkflow(workflow);

    log(jobId, "agent", `${draft.analyzer} analysed brief: ${analysis.deliverables.length} deliverables, confidence ${Math.round(analysis.confidence * 100)}%. Recommendation: ${decision}.`);
    log(jobId, "agent", `Production plan v${version}: ${workflow.steps.length} steps, est. $${workflow.estimatedTotalCost.toFixed(2)}, proposed cap $${workflow.maxBudget}.`);

    if (decision === "reject") {
      repo.updateJob(jobId, { status: "rejected", rightsCleared: false });
      log(jobId, "agent", "Moved to Rejected. Reopen to override.");
      return;
    }
    repo.updateJob(jobId, { status: "needs_review", rightsCleared: analysis.rightsConcerns.length === 0 });
    if (analysis.rightsConcerns.length) {
      requestApproval(jobId, "rights_clearance", "Clear rights concerns", analysis.rightsConcerns.join(" "), null, analysis.id);
    }
    requestApproval(
      jobId,
      "initial_workflow",
      "Approve workflow & maximum budget",
      `Plan v${version} with ${workflow.steps.length} steps. Estimated spend $${workflow.estimatedTotalCost.toFixed(2)}.`,
      workflow.maxBudget,
      workflow.id,
    );
  });
}

export function updateEconomics(jobId: string, patch: { sourceFeePct?: number; contingencyPct?: number; budget?: number }) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  const wf = repo.getCurrentWorkflow(jobId);
  if (patch.budget !== undefined && wf?.approvalStatus === "approved") {
    throw new GuardrailError("Client price is locked once the workflow is approved.");
  }
  repo.updateJob(jobId, patch);
  if (wf && wf.approvalStatus !== "approved" && patch.contingencyPct !== undefined) {
    const maxBudget = Math.ceil(wf.estimatedTotalCost * (1 + patch.contingencyPct));
    repo.updateWorkflow(wf.id, { maxBudget });
    const pending = repo.listApprovals(jobId).find((a) => a.kind === "initial_workflow" && a.status === "pending");
    if (pending) repo.updateApproval(pending.id, { amount: maxBudget });
  }
  log(jobId, "operator", "Updated pricing assumptions.");
}

// ---------------------------------------------------------------------------
// Human decisions
// ---------------------------------------------------------------------------

export function clearRights(jobId: string, approvalId: string, note: string) {
  const repo = getRepo();
  repo.transaction(() => {
    decideApproval(approvalId, "approved", config.operatorName);
    repo.updateJob(jobId, { rightsCleared: true });
    log(jobId, "operator", `Cleared rights concerns${note ? `: ${note}` : "."}`);
  });
}

export function approveInitialWorkflow(jobId: string, maxBudget: number) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  const analysis = repo.getLatestAnalysis(jobId);
  if (!job || !wf || !analysis) throw new GuardrailError("Nothing to approve.");
  if (job.status !== "needs_review") throw new GuardrailError(`Job is ${job.status}; only jobs in Needs Review can be approved.`);
  assertRightsCleared(job, analysis.rightsConcerns);
  assertMaxBudgetSane(maxBudget, wf.estimatedTotalCost, job.budget);

  repo.transaction(() => {
    repo.updateWorkflow(wf.id, { approvalStatus: "approved", maxBudget, approvedAt: now(), approvedBy: config.operatorName });
    const pending = repo.listApprovals(jobId).find((a) => a.kind === "initial_workflow" && a.status === "pending");
    if (pending) {
      repo.updateApproval(pending.id, { amount: maxBudget });
      decideApproval(pending.id, "approved", config.operatorName);
    }
    repo.updateJob(jobId, { status: "approved" });
    log(jobId, "operator", `Approved workflow v${wf.version} with a $${maxBudget} generation cap. Agent may operate inside this limit.`);
  });
}

export function rejectJob(jobId: string, reason: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  if (["generating", "delivered"].includes(job.status)) throw new GuardrailError(`Cannot reject a job that is ${job.status}.`);
  repo.transaction(() => {
    for (const a of repo.listApprovals(jobId).filter((x) => x.status === "pending")) decideApproval(a.id, "rejected", config.operatorName);
    repo.updateJob(jobId, { status: "rejected" });
    log(jobId, "operator", `Rejected job${reason ? `: ${reason}` : "."}`);
  });
}

export async function reopenJob(jobId: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job || job.status !== "rejected") throw new GuardrailError("Only rejected jobs can be reopened.");
  log(jobId, "operator", "Reopened job for review (override).");
  repo.updateJob(jobId, { status: "needs_review" });
  const wf = repo.getCurrentWorkflow(jobId);
  const analysis = repo.getLatestAnalysis(jobId);
  if (wf && analysis) {
    repo.updateWorkflow(wf.id, { approvalStatus: "pending" });
    repo.updateJob(jobId, { rightsCleared: analysis.rightsConcerns.length === 0 });
    if (analysis.rightsConcerns.length) requestApproval(jobId, "rights_clearance", "Clear rights concerns", analysis.rightsConcerns.join(" "), null, analysis.id);
    requestApproval(jobId, "initial_workflow", "Approve workflow & maximum budget", `Plan v${wf.version} (reopened after rejection).`, wf.maxBudget, wf.id);
  }
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function promptFor(step: WorkflowStep, analysis: BriefAnalysis | null, attempt: number, extra?: string) {
  const parts = [
    step.purpose,
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
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  assertWorkflowApproved(job, wf);
  if (job.status !== "approved") throw new GuardrailError("Production can only start from Approved.");
  repo.updateJob(jobId, { status: "generating" });
  log(jobId, "agent", "Started production inside the approved budget.");
  await tick(jobId);
}

async function submitGeneration(job: Job, wf: Workflow, step: WorkflowStep, attempt: number, prompt: string, revisionId: string | null, estimate: number): Promise<"submitted" | "over_budget"> {
  const repo = getRepo();
  const gens = repo.listGenerations(job.id);
  if (!fitsBudget(wf, gens, estimate)) return "over_budget";
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
    error: null,
    timedOutAt: null,
    createdAt: now(),
    startedAt: now(),
    completedAt: null,
  };
  repo.insertGeneration(gen);
  // Use the provider's cost estimate before paying, when it exposes one.
  if (provider.capabilities.estimate && provider.estimate) {
    try {
      const est = await provider.estimate({ generationId: gen.id, modelId: step.modelId, prompt, costEstimate: estimate });
      if (est.estimatedCost !== null && Math.abs(est.estimatedCost - estimate) >= 0.01) {
        log(job.id, "agent", `${model.label}: provider estimate $${est.estimatedCost.toFixed(2)} vs catalog $${estimate.toFixed(2)} (budget uses the catalog figure).`);
      }
    } catch (err) {
      log(job.id, "system", `Cost estimate unavailable: ${scrubSecrets((err as Error).message)}`);
    }
  }
  try {
    const r = await provider.submit({ generationId: gen.id, modelId: step.modelId, prompt, costEstimate: estimate });
    repo.updateGeneration(gen.id, { providerRequestId: r.providerRequestId, statusUrl: r.statusUrl, status: r.status });
    log(job.id, "agent", `Submitted take ${attempt} of “${step.name}” on ${model.label} (${model.endpoint}); est. $${estimate.toFixed(2)}, request ${r.providerRequestId}.`);
  } catch (err) {
    // Failed submit is never charged (status "failed", actualCost 0). Scrub secrets.
    repo.updateGeneration(gen.id, { status: "failed", error: scrubSecrets((err as Error).message), completedAt: now(), actualCost: 0 });
  }
  return "submitted";
}

function blockForBudget(job: Job, wf: Workflow, step: WorkflowStep, needed: number) {
  const repo = getRepo();
  repo.updateStep(step.id, { status: "blocked" });
  const spent = committedSpend(repo.listGenerations(job.id));
  const proposed = Math.ceil(spent + needed);
  requestApproval(
    job.id,
    "budget_increase",
    `Raise cap to $${proposed} to continue “${step.name}”`,
    `Committed spend $${spent.toFixed(2)} + $${needed.toFixed(2)} for remaining attempts exceeds the approved $${wf.maxBudget} cap. The agent has paused.`,
    proposed,
    step.id,
  );
}

/** Advance production: poll in-flight work, then submit the next step if (and only if) it fits the cap. */
export async function tick(jobId: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job || job.status !== "generating") return;
  const wf = repo.getCurrentWorkflow(jobId);
  if (!wf || wf.approvalStatus !== "approved") return;
  const provider = getProvider();
  const analysis = repo.getLatestAnalysis(jobId);

  // 1. poll in-flight work (and enforce the app-level timeout, which is tracked
  //    separately from the provider's status — never reported as a provider status).
  for (const g of repo.listGenerations(jobId).filter((x) => (x.status === "queued" || x.status === "in_progress") && !x.timedOutAt)) {
    const elapsed = Date.now() - new Date(g.startedAt ?? g.createdAt).getTime();
    if (elapsed > config.generation.timeoutMs) {
      repo.updateGeneration(g.id, { timedOutAt: now() });
      log(jobId, "system", `Take ${g.attempt} on ${getModel(g.model).label} exceeded the ${Math.round(config.generation.timeoutMs / 60000)}-min polling limit; marked timed out (provider status left as ${g.status}). Not charged.`);
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
        if (persisted.note) log(jobId, "system", `Could not copy output to app storage (${persisted.note}); using the provider URL, which may expire.`);
      }
      if (r.status !== g.status || outputUrl !== g.outputUrl) {
        repo.updateGeneration(g.id, {
          status: r.status,
          outputUrl,
          outputType,
          actualCost: r.actualCost !== undefined ? r.actualCost : g.actualCost,
          error: r.error ? scrubSecrets(r.error) : null,
          completedAt: terminal ? now() : null,
        });
        if (terminal) {
          const cost = r.status === "completed" ? (r.actualCost ?? g.costEstimate) : 0;
          log(jobId, "agent", `Take ${g.attempt} ${r.status}${r.status === "completed" ? ` · recorded $${cost.toFixed(2)}` : ""}.`);
        }
      }
    } catch (err) {
      repo.updateGeneration(g.id, { error: `Poll error: ${scrubSecrets((err as Error).message)}` });
    }
  }

  // 2. settle steps + revisions
  let gens = repo.listGenerations(jobId);
  // Timed-out generations are no longer "in flight" for settling purposes.
  const inFlight = (xs: Generation[]) => xs.some((g) => (g.status === "queued" || g.status === "in_progress") && !g.timedOutAt);
  for (const step of wf.steps.filter((s) => s.status === "running")) {
    const sg = gens.filter((g) => g.stepId === step.id && !g.revisionId);
    if (inFlight(sg)) continue;
    const completed = sg.filter((g) => g.status === "completed");
    if (completed.length) {
      repo.updateStep(step.id, { status: "done" });
      if (!completed.some((g) => g.selected)) repo.updateGeneration(completed[0].id, { selected: true });
      log(jobId, "agent", `“${step.name}” finished: ${completed.length}/${sg.length} attempts usable.`);
    } else if (sg.length < step.estimatedAttempts + MAX_AUTO_RETRIES) {
      const r = await submitGeneration(job, wf, step, sg.length + 1, promptFor(step, analysis, sg.length + 1, "Retry after failure."), null, step.unitCost);
      if (r === "over_budget") blockForBudget(job, wf, step, step.unitCost);
      else log(jobId, "agent", `All attempts failed on “${step.name}”; retrying within budget.`);
    } else {
      repo.updateStep(step.id, { status: "failed" });
      log(jobId, "agent", `“${step.name}” failed after retries. Needs operator attention.`);
    }
  }
  for (const rev of repo.listRevisions(jobId).filter((r) => r.runStatus === "running")) {
    const rg = repo.listGenerations(jobId).filter((g) => g.revisionId === rev.id);
    if (!inFlight(rg)) {
      repo.updateRevision(rev.id, { runStatus: "done" });
      const best = rg.find((g) => g.status === "completed");
      if (best) repo.updateGeneration(best.id, { selected: true });
      log(jobId, "agent", `Revision applied: ${rev.actionSummary}`);
    }
  }

  // 3. start the next pending step (sequential — each step feeds the next)
  const fresh = repo.getCurrentWorkflow(jobId)!;
  gens = repo.listGenerations(jobId);
  const running = fresh.steps.some((s) => s.status === "running");
  const blocked = fresh.steps.some((s) => s.status === "blocked" || s.status === "failed");
  if (!running && !blocked) {
    const next = fresh.steps.find((s) => s.status === "pending");
    if (next) {
      const needed = next.unitCost * next.estimatedAttempts;
      if (!fitsBudget(fresh, gens, needed)) {
        blockForBudget(job, fresh, next, needed);
      } else {
        repo.updateStep(next.id, { status: "running" });
        for (let i = 1; i <= next.estimatedAttempts; i++) {
          await submitGeneration(job, fresh, next, i, promptFor(next, analysis, i), null, next.unitCost);
        }
        log(jobId, "agent", `Submitted ${next.estimatedAttempts} attempts for “${next.name}” on ${getModel(next.modelId).label}.`);
      }
    }
  }

  // 4. all done → QA + final delivery gate
  const end = repo.getCurrentWorkflow(jobId)!;
  const endGens = repo.listGenerations(jobId);
  const allStepsDone = end.steps.every((s) => s.status === "done" || s.status === "skipped");
  const revisionsRunning = repo.listRevisions(jobId).some((r) => r.runStatus === "running");
  if (allStepsDone && !inFlight(endGens) && !revisionsRunning) {
    repo.updateJob(jobId, { status: "qa" });
    log(jobId, "agent", "Production complete. Moved to QA for human review.");
    requestApproval(jobId, "final_delivery", "Approve final delivery", "Review outputs. Delivery to the client is done by you, outside Studio Operator.", null, null);
  }
}

export async function tickAllGenerating() {
  for (const j of getRepo().listJobs().filter((x) => x.status === "generating")) await tick(j.id);
}

export async function approveBudgetIncrease(jobId: string, approvalId: string, newCap: number) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  const ap = repo.getApproval(approvalId);
  if (!job || !wf || !ap || ap.status !== "pending") throw new GuardrailError("Approval not found or already decided.");
  if (newCap <= wf.maxBudget) throw new GuardrailError("New cap must be higher than the current cap.");
  if (newCap > job.budget) throw new GuardrailError("Cap cannot exceed the client price.");
  repo.transaction(() => {
    repo.updateWorkflow(wf.id, { maxBudget: newCap });
    repo.updateApproval(approvalId, { amount: newCap });
    decideApproval(approvalId, "approved", config.operatorName);
    if (ap.refId) {
      const step = wf.steps.find((s) => s.id === ap.refId);
      if (step?.status === "blocked") repo.updateStep(step.id, { status: step && repo.listGenerations(jobId).some((g) => g.stepId === step.id) ? "running" : "pending" });
      const rev = repo.getRevision(ap.refId);
      if (rev) repo.updateRevision(rev.id, { approvalStatus: "approved" });
    }
    log(jobId, "operator", `Raised generation cap from $${wf.maxBudget} to $${newCap}.`);
  });
  await tick(jobId);
}

export function decideGenericApproval(jobId: string, approvalId: string, status: "approved" | "rejected") {
  const repo = getRepo();
  const ap = repo.getApproval(approvalId);
  if (!ap || ap.status !== "pending") throw new GuardrailError("Approval not found or already decided.");
  repo.transaction(() => {
    decideApproval(approvalId, status, config.operatorName);
    const rev = ap.refId ? repo.getRevision(ap.refId) : null;
    if (rev) repo.updateRevision(rev.id, { approvalStatus: status });
    log(jobId, "operator", `${status === "approved" ? "Approved" : "Declined"}: ${ap.title}`);
  });
}

export async function retryStep(jobId: string, stepId: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  assertWorkflowApproved(job, wf);
  const step = wf.steps.find((s) => s.id === stepId);
  if (!step || step.status !== "failed") throw new GuardrailError("Only failed steps can be retried.");
  repo.updateStep(stepId, { status: "running" });
  const r = await submitGeneration(job, wf, step, repo.listGenerations(jobId).filter((g) => g.stepId === stepId).length + 1, promptFor(step, repo.getLatestAnalysis(jobId), 99, "Operator-requested retry."), null, step.unitCost);
  if (r === "over_budget") blockForBudget(job, wf, step, step.unitCost);
  if (job.status !== "generating") repo.updateJob(jobId, { status: "generating" });
  log(jobId, "operator", `Retried “${step.name}”.`);
}

export function toggleSelect(generationId: string) {
  const repo = getRepo();
  const g = repo.getGeneration(generationId);
  if (!g || g.status !== "completed") throw new GuardrailError("Only completed outputs can be selected.");
  repo.updateGeneration(g.id, { selected: !g.selected });
}

/**
 * Ask the provider to cancel a generation. Only allowed while the request is
 * still queued, and only when the current provider exposes a cancel action.
 */
export async function cancelGeneration(jobId: string, generationId: string) {
  const repo = getRepo();
  const g = repo.getGeneration(generationId);
  if (!g || g.jobId !== jobId) throw new GuardrailError("Generation not found.");
  if (g.status !== "queued") throw new GuardrailError("Only queued generations can be cancelled.");
  const provider = getProvider();
  if (!provider.capabilities.cancel || !provider.cancel) throw new GuardrailError("This provider does not expose a cancel action.");
  try {
    const r = await provider.cancel(g);
    repo.updateGeneration(g.id, { status: r.status ?? "canceled", actualCost: 0, completedAt: now(), error: null });
    log(jobId, "operator", `Cancelled take ${g.attempt} on ${getModel(g.model).label}. Not charged.`);
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
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  const g = repo.getGeneration(generationId);
  if (!job || !g || g.jobId !== jobId) throw new GuardrailError("Generation not found.");
  assertWorkflowApproved(job, wf);
  const retryable = g.status === "failed" || g.status === "nsfw" || g.status === "canceled" || !!g.timedOutAt;
  if (!retryable) throw new GuardrailError("Only failed, timed-out or cancelled generations can be retried.");
  const step = wf.steps.find((s) => s.id === g.stepId);
  if (!step) throw new GuardrailError("Original step no longer exists.");
  const attempt = repo.listGenerations(jobId).filter((x) => x.stepId === step.id).length + 1;
  if (job.status !== "generating") repo.updateJob(jobId, { status: "generating" });
  if (step.status === "failed" || step.status === "blocked") repo.updateStep(step.id, { status: "running" });
  const r = await submitGeneration(job, wf, step, attempt, promptFor(step, repo.getLatestAnalysis(jobId), attempt, "Operator-requested retry of a prior attempt."), g.revisionId, step.unitCost);
  if (r === "over_budget") blockForBudget(job, wf, step, step.unitCost);
  log(jobId, "operator", `Retried take ${g.attempt} as a new attempt on “${step.name}”.`);
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export function addRevision(jobId: string, note: string, deliverable: string | null) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  if (!job || !wf) throw new GuardrailError("Job not found.");
  if (job.status !== "qa") throw new GuardrailError("Revision notes are collected while the job is in QA.");
  if (!note.trim()) throw new GuardrailError("Revision note is empty.");
  const plan = planRevision(note, repo.getLatestAnalysis(jobId), deliverable);
  const spent = committedSpend(repo.listGenerations(jobId));
  const reservedForApproved = repo
    .listRevisions(jobId)
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
  repo.transaction(() => {
    repo.insertRevision(rev);
    log(jobId, "operator", `Logged client note: “${rev.clientNote.slice(0, 80)}”`);
    if (kind === "workflow_change") {
      requestApproval(jobId, "workflow_change", "Approve scope change", `${rev.actionSummary} Client note: “${rev.clientNote}”`, null, rev.id);
    } else if (kind === "budget_increase") {
      requestApproval(jobId, "budget_increase", `Raise cap to $${Math.ceil(spent + reservedForApproved + plan.expectedIncrementalCost)} for revision`, approvalReason!, Math.ceil(spent + reservedForApproved + plan.expectedIncrementalCost), rev.id);
    } else if (rev.approvalStatus === "approved") {
      log(jobId, "agent", `Revision fits remaining budget ($${remaining.toFixed(2)}); auto-approved within limits.`);
    }
  });
  return rev.id;
}

export async function runRevision(jobId: string, revisionId: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const wf = repo.getCurrentWorkflow(jobId);
  const rev = repo.getRevision(revisionId);
  if (!job || !rev) throw new GuardrailError("Revision not found.");
  assertWorkflowApproved(job, wf);
  if (rev.approvalStatus !== "approved") throw new GuardrailError("Revision is not approved.");
  if (rev.materialChange) throw new GuardrailError("Scope changes are re-planned and re-quoted, not run as revisions.");
  if (!rev.modelId || rev.attempts === 0) throw new GuardrailError("This revision has no generation work.");
  if (rev.runStatus !== "not_started") throw new GuardrailError("Revision already run.");
  const step = wf.steps.find((s) => s.modelId === rev.modelId) ?? wf.steps.find((s) => getModel(s.modelId).category === getModel(rev.modelId!).category) ?? wf.steps[wf.steps.length - 1];
  const unit = getModel(rev.modelId).unitCostUsd;
  if (!fitsBudget(wf, repo.listGenerations(jobId), unit * rev.attempts)) {
    throw new GuardrailError("Revision would exceed the approved cap. Request a budget increase.");
  }
  repo.updateRevision(rev.id, { runStatus: "running" });
  repo.updateJob(jobId, { status: "generating" });
  for (const a of repo.listApprovals(jobId).filter((x) => x.kind === "final_delivery" && x.status === "pending")) {
    repo.updateApproval(a.id, { status: "rejected", decidedBy: "system", decidedAt: now(), reason: "Superseded — revision in progress." });
  }
  const pseudoStep: WorkflowStep = { ...step, modelId: rev.modelId, unitCost: unit, purpose: rev.actionSummary };
  for (let i = 1; i <= rev.attempts; i++) {
    await submitGeneration(job, wf, pseudoStep, i, promptFor(pseudoStep, repo.getLatestAnalysis(jobId), i, `Client note: ${rev.clientNote}`), rev.id, unit);
  }
  log(jobId, "agent", `Running revision: ${rev.actionSummary}`);
}

export function approveFinalDelivery(jobId: string, attestation: string) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job || job.status !== "qa") throw new GuardrailError("Only jobs in QA can be approved for delivery.");
  const pending = repo.listApprovals(jobId).filter((a) => a.status === "pending");
  const delivery = pending.find((a) => a.kind === "final_delivery");
  const blocking = pending.filter((a) => a.kind !== "final_delivery");
  if (!delivery) throw new GuardrailError("No final delivery approval is pending.");
  if (blocking.length) throw new GuardrailError(`Resolve ${blocking.length} other pending approval(s) first.`);
  if (repo.listRevisions(jobId).some((r) => r.approvalStatus === "approved" && r.runStatus !== "done" && r.modelId)) {
    throw new GuardrailError("There are approved revisions that have not been run.");
  }
  const selected = repo.listGenerations(jobId).filter((g) => g.selected);
  if (selected.length === 0) throw new GuardrailError("Select at least one output for delivery.");
  repo.transaction(() => {
    decideApproval(delivery.id, "approved", config.operatorName);
    repo.updateJob(jobId, { status: "delivered", deliveredAt: now() });
    log(jobId, "operator", `Approved final delivery (${selected.length} selected outputs). ${attestation}`);
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

export async function providerConnectionTest(): Promise<{ ok: boolean; detail: string; name: string; live: boolean }> {
  const p = getProvider();
  try {
    const r = await p.connectionTest();
    return { ok: r.ok, detail: scrubSecrets(r.detail), name: p.name, live: p.live };
  } catch (err) {
    return { ok: false, detail: scrubSecrets((err as Error).message), name: p.name, live: p.live };
  }
}
