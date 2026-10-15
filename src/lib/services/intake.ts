import "server-only";
import { config } from "@/lib/config";
import { analyzeBrief } from "@/lib/analysis/astra";
import { computeCostPlan } from "@/lib/analysis/cost";
import { decideJob, type FinalDecision } from "@/lib/analysis/decision";
import type { Analysis } from "@/lib/analysis/schema";
import type { IntakeAnalysis, Job } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { daysUntil } from "@/lib/utils";
import { newId } from "./ids";

const now = () => new Date().toISOString();

function thresholds() {
  return {
    minGrossMarginPct: config.economics.minGrossMarginPct,
    rejectBelowMarginPct: config.economics.rejectBelowMarginPct,
    maxProductionBudgetUsd: config.economics.maxProductionBudgetUsd,
    minConfidencePct: config.economics.minConfidencePct,
    maxMissingAssets: config.economics.maxMissingAssets,
  };
}

/** Deterministically price + decide an analysis for a job. Pure of persistence. */
export function evaluateAnalysis(analysis: Analysis, job: Job): { decision: FinalDecision; reasons: string[]; estimatedSpend: number } {
  const plan = computeCostPlan(analysis, config.economics.maxAttemptsPerStep);
  const result = decideJob(
    analysis,
    plan,
    { clientPrice: job.budget, sourceFeePct: job.sourceFeePct, contingencyPct: job.contingencyPct },
    thresholds(),
    { deadlineDays: daysUntil(job.deadline) },
  );
  return { decision: result.decision, reasons: result.reasons, estimatedSpend: plan.estimatedSpend };
}

/** Run the real (or mock) structured analysis for a job and persist it as `original`. */
export async function runIntakeAnalysis(job: Job): Promise<IntakeAnalysis> {
  const { analysis, analyzer, warning } = await analyzeBrief({
    rawBrief: job.rawBrief,
    budget: job.budget,
    deadline: job.deadline,
    source: job.source,
    referenceAssets: job.referenceAssets,
    clientNotes: job.clientNotes,
  });
  const { decision, reasons, estimatedSpend } = evaluateAnalysis(analysis, job);

  const record: IntakeAnalysis = {
    id: newId("ia"),
    jobId: job.id,
    analyzer,
    original: analysis,
    edited: null,
    decision,
    decisionReasons: reasons,
    estimatedSpend,
    reviewStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    warning,
    createdAt: now(),
  };
  const repo = getRepo();
  repo.insertIntakeAnalysis(record);
  if (warning) repo.insertActivity({ id: newId("ev"), jobId: job.id, actor: "system", message: warning, createdAt: now() });
  repo.insertActivity({
    id: newId("ev"),
    jobId: job.id,
    actor: "agent",
    message: `${analyzer} analysed the brief (confidence ${analysis.confidence}%). Deterministic decision: ${decision}${estimatedSpend ? `, est. spend $${estimatedSpend.toFixed(2)}` : ""}.`,
    createdAt: now(),
  });
  return record;
}

export function getIntake(jobId: string): IntakeAnalysis | null {
  return getRepo().getLatestIntakeAnalysis(jobId);
}

/** The effective analysis a human would act on: their edits if present, else the model's. */
export function effectiveAnalysis(record: IntakeAnalysis): Analysis {
  return record.edited ?? record.original;
}

export interface ReviewInput {
  edited: Analysis; // the (possibly unchanged) human-reviewed analysis
  action: "save" | "approve" | "reject";
  reviewer?: string;
}

/**
 * Save the human-edited analysis and re-run the deterministic decision on it.
 * `original` is never overwritten, so the two can always be compared.
 */
export function reviewIntake(jobId: string, input: ReviewInput) {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const record = repo.getLatestIntakeAnalysis(jobId);
  if (!job || !record) throw new Error("No intake analysis to review.");

  const { decision, reasons, estimatedSpend } = evaluateAnalysis(input.edited, job);
  const reviewer = input.reviewer ?? config.operatorName;
  const reviewStatus = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "pending";

  repo.transaction(() => {
    repo.updateIntakeAnalysis(record.id, {
      edited: input.edited,
      decision,
      decisionReasons: reasons,
      estimatedSpend,
      reviewStatus,
      reviewedBy: input.action === "save" ? record.reviewedBy : reviewer,
      reviewedAt: input.action === "save" ? record.reviewedAt : now(),
    });
    const verb = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "saved edits to";
    repo.insertActivity({ id: newId("ev"), jobId, actor: "operator", message: `${reviewer} ${verb} the intake analysis (decision: ${decision}).`, createdAt: now() });

    if (input.action === "reject") {
      repo.updateJob(jobId, { status: "rejected" });
      repo.insertActivity({ id: newId("ev"), jobId, actor: "operator", message: "Job rejected from analysis review. Decline it on the marketplace too.", createdAt: now() });
    } else if (input.action === "approve" && job.status === "new") {
      repo.updateJob(jobId, { status: "needs_review" });
    }
  });

  return { decision, reasons, estimatedSpend, reviewStatus };
}
