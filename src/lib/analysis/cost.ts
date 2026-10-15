import { resolveCapability, CAPABILITY_LABEL } from "./capabilities";
import type { Analysis, Capability } from "./schema";

// ---------------------------------------------------------------------------
// Deterministic cost calculator.
//
// Takes the model's proposed workflow (capabilities + estimated attempts) and
// prices it entirely from the application's catalog. Attempts are clamped to
// the approved per-step limit. Any capability the catalog can't price is
// recorded so the decision layer can route the job to a human instead of
// guessing a number.
// ---------------------------------------------------------------------------

export interface PlannedStep {
  capability: Capability;
  label: string;
  description: string;
  modelId: string;
  unitCostUsd: number;
  estimatedAttempts: number; // model's estimate, clamped to the approved limit
  stepCost: number;
}

export interface CostPlan {
  steps: PlannedStep[];
  estimatedSpend: number; // sum of priced step costs, USD
  unpricedCapabilities: Capability[]; // capabilities with no catalogue price
  hasAllPrices: boolean;
  attemptLimitPerStep: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeCostPlan(analysis: Analysis, attemptLimitPerStep: number): CostPlan {
  const steps: PlannedStep[] = [];
  const unpricedCapabilities: Capability[] = [];

  analysis.proposedWorkflow.forEach((step, i) => {
    const requested = analysis.estimatedAttemptsByStep[i] ?? 0;
    const estimatedAttempts = Math.max(0, Math.min(requested, attemptLimitPerStep));
    const model = resolveCapability(step.capability);
    if (!model) {
      if (!unpricedCapabilities.includes(step.capability)) unpricedCapabilities.push(step.capability);
      return;
    }
    steps.push({
      capability: step.capability,
      label: CAPABILITY_LABEL[step.capability],
      description: step.description,
      modelId: model.id,
      unitCostUsd: model.unitCostUsd,
      estimatedAttempts,
      stepCost: round(model.unitCostUsd * estimatedAttempts),
    });
  });

  return {
    steps,
    estimatedSpend: round(steps.reduce((a, s) => a + s.stepCost, 0)),
    unpricedCapabilities,
    hasAllPrices: unpricedCapabilities.length === 0 && analysis.proposedWorkflow.length > 0,
    attemptLimitPerStep,
  };
}
