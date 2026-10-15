import type { Generation, Job, Revision, Workflow } from "@/lib/domain/types";

export interface Profitability {
  clientPrice: number;
  sourceFeePct: number;
  sourceFee: number;
  netRevenue: number;
  estimatedSpend: number;
  approvedRevisionSpend: number;
  contingencyPct: number;
  contingency: number;
  expectedGrossMargin: number;
  expectedGrossMarginPct: number;
  maxBudget: number | null;
  committedSpend: number; // actual where known, else estimate, for submitted generations
  actualSpend: number; // only reconciled provider costs
  remainingBudget: number | null;
  worstCaseMargin: number | null; // if the full approved cap is spent
  worstCaseMarginPct: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function generationSpend(g: Generation) {
  // Never charge generations that produced nothing usable: provider failures,
  // moderation rejections, cancellations, budget blocks, or an app-level timeout.
  if (g.status === "blocked" || g.status === "canceled" || g.status === "failed" || g.status === "nsfw") return 0;
  if (g.timedOutAt) return 0;
  // Reconcile to the provider's actual spend once known; fall back to the estimate.
  if (g.actualCost !== null) return g.actualCost;
  return g.costEstimate;
}

export function computeProfitability(job: Job, workflow: Workflow | null, generations: Generation[], revisions: Revision[]): Profitability {
  const sourceFee = round(job.budget * job.sourceFeePct);
  const netRevenue = round(job.budget - sourceFee);
  const approvedRevisionSpend = round(
    revisions.filter((r) => r.approvalStatus === "approved").reduce((a, r) => a + r.expectedIncrementalCost, 0),
  );
  const estimatedSpend = round((workflow?.estimatedTotalCost ?? 0) + approvedRevisionSpend);
  const contingency = round(estimatedSpend * job.contingencyPct);
  const expectedGrossMargin = round(netRevenue - estimatedSpend - contingency);
  const committedSpend = round(generations.reduce((a, g) => a + generationSpend(g), 0));
  const actualSpend = round(generations.reduce((a, g) => a + (g.actualCost ?? 0), 0));
  const maxBudget = workflow?.maxBudget ?? null;
  const worstCaseMargin = maxBudget !== null ? round(netRevenue - maxBudget) : null;
  return {
    clientPrice: job.budget,
    sourceFeePct: job.sourceFeePct,
    sourceFee,
    netRevenue,
    estimatedSpend,
    approvedRevisionSpend,
    contingencyPct: job.contingencyPct,
    contingency,
    expectedGrossMargin,
    expectedGrossMarginPct: job.budget > 0 ? expectedGrossMargin / job.budget : 0,
    maxBudget,
    committedSpend,
    actualSpend,
    remainingBudget: maxBudget !== null ? round(maxBudget - committedSpend) : null,
    worstCaseMargin,
    worstCaseMarginPct: worstCaseMargin !== null && job.budget > 0 ? worstCaseMargin / job.budget : null,
  };
}
