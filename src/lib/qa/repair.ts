import type { QaReport } from "./qa";

// ---------------------------------------------------------------------------
// Repair policy. A QA-driven repair may run AUTOMATICALLY only when it stays
// inside the pre-approved per-repair and per-job repair spend limits, the
// per-job auto-repair count, and the remaining approved cap. Anything outside
// those limits is recommended but requires human approval. Every repair exposes
// the reason, selected model, expected incremental cost, new total and updated
// margin. Pure + unit-testable.
// ---------------------------------------------------------------------------

export interface RepairLimits {
  perRepairMaxUsd: number;
  perJobRepairMaxUsd: number;
  maxAutoRepairsPerJob: number;
}

export interface RepairContext {
  modelId: string;
  modelLabel: string;
  unitCostUsd: number;
  attempts: number;
  jobRepairSpentUsd: number;
  autoRepairsSoFar: number;
  priorTotalUsd: number;
  clientPriceUsd: number;
  netRevenueUsd: number;
  remainingCapUsd: number;
}

export interface RepairDecision {
  recommended: boolean;
  auto: boolean;
  needsApproval: boolean;
  reason: string;
  modelId: string;
  modelLabel: string;
  attempts: number;
  incrementalCostUsd: number;
  newTotalUsd: number;
  newMarginUsd: number;
  newMarginPct: number;
  blockedBy: string | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function decideRepair(report: QaReport, reason: string, ctx: RepairContext, limits: RepairLimits): RepairDecision {
  const recommended = report.verdict === "controlled_edit" || report.verdict === "regenerate";
  const incrementalCostUsd = round(ctx.unitCostUsd * ctx.attempts);
  const newTotalUsd = round(ctx.priorTotalUsd + incrementalCostUsd);
  const newMarginUsd = round(ctx.netRevenueUsd - newTotalUsd);
  const newMarginPct = ctx.clientPriceUsd > 0 ? newMarginUsd / ctx.clientPriceUsd : 0;

  let blockedBy: string | null = null;
  if (incrementalCostUsd > limits.perRepairMaxUsd) blockedBy = `per-repair limit $${limits.perRepairMaxUsd}`;
  else if (ctx.jobRepairSpentUsd + incrementalCostUsd > limits.perJobRepairMaxUsd) blockedBy = `per-job repair limit $${limits.perJobRepairMaxUsd}`;
  else if (ctx.autoRepairsSoFar >= limits.maxAutoRepairsPerJob) blockedBy = `max ${limits.maxAutoRepairsPerJob} auto-repairs/job`;
  else if (incrementalCostUsd > ctx.remainingCapUsd) blockedBy = "remaining approved cap";

  const auto = recommended && blockedBy === null;
  return {
    recommended,
    auto,
    needsApproval: recommended && !auto,
    reason,
    modelId: ctx.modelId,
    modelLabel: ctx.modelLabel,
    attempts: ctx.attempts,
    incrementalCostUsd,
    newTotalUsd,
    newMarginUsd,
    newMarginPct,
    blockedBy,
  };
}
