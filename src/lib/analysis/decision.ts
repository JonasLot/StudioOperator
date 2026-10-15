import type { Analysis } from "./schema";
import type { CostPlan } from "./cost";

// ---------------------------------------------------------------------------
// Deterministic accept / human_review / reject.
//
// The model's own `decision` is only a suggestion. The application decides for
// real, using catalog-priced costs, source/channel fees, contingency, the
// approved attempt limits and a configured production budget. The model is
// never allowed to make the app *less* cautious than its own suggestion, and
// the app can override an over-optimistic model with a reject/review.
//
// Pure module: all thresholds and economics are passed in, so it is fully
// unit-testable without config or a database.
// ---------------------------------------------------------------------------

export type FinalDecision = "accept" | "human_review" | "reject";

export interface DecisionEconomics {
  clientPrice: number;
  sourceFeePct: number; // 0..1
  contingencyPct: number; // 0..1
}

export interface DecisionThresholds {
  minGrossMarginPct: number; // healthy-margin target, e.g. 0.45
  rejectBelowMarginPct: number; // hard floor, e.g. 0.15
  maxProductionBudgetUsd: number; // configured ceiling on generation spend + contingency
  minConfidencePct: number; // e.g. 55
  maxMissingAssets: number; // e.g. 2
}

export interface ComputedEconomics {
  netRevenue: number;
  estimatedSpend: number;
  contingency: number;
  totalWithContingency: number;
  expectedGrossMargin: number;
  expectedGrossMarginPct: number;
}

export interface DecisionResult {
  decision: FinalDecision;
  reasons: string[];
  economics: ComputedEconomics | null; // null when costs could not be priced
}

const RANK: Record<FinalDecision, number> = { accept: 0, human_review: 1, reject: 2 };
const round = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${round(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CONSENT_LABEL: Record<string, string> = {
  logo: "exact logo",
  packaging_text: "packaging text",
  person_likeness: "a real person's likeness",
  person_voice: "a real person's voice",
  factual_claim: "a factual claim",
  licensed_music: "licensed music",
  unclear_rights: "unclear rights",
  impersonation: "deceptive impersonation",
  other: "a rights/consent concern",
};

export function decideJob(
  analysis: Analysis,
  plan: CostPlan,
  economics: DecisionEconomics,
  thresholds: DecisionThresholds,
  ctx: { deadlineDays: number },
): DecisionResult {
  let decision: FinalDecision = "accept";
  const reasons: string[] = [];
  const escalate = (to: FinalDecision, reason: string) => {
    if (RANK[to] > RANK[decision]) decision = to;
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  // --- Hard stops --------------------------------------------------------
  const impersonation = analysis.rightsAndConsentFlags.find((f) => f.kind === "impersonation");
  if (impersonation) {
    escalate("reject", `Requires deceptive impersonation — the studio does not produce this${impersonation.detail ? ` (${impersonation.detail})` : ""}.`);
  }

  if (analysis.deliverables.length === 0) {
    escalate("reject", "No clear deliverable — nothing concrete to produce.");
  }
  if (analysis.proposedWorkflow.length === 0) {
    escalate("reject", "No production plan could be proposed — cannot deliver this reliably.");
  }

  // --- Economics (only when every step is catalogue-priced) --------------
  let computed: ComputedEconomics | null = null;
  if (plan.hasAllPrices) {
    const netRevenue = round(economics.clientPrice * (1 - economics.sourceFeePct));
    const estimatedSpend = round(plan.estimatedSpend);
    const contingency = round(estimatedSpend * economics.contingencyPct);
    const totalWithContingency = round(estimatedSpend + contingency);
    const expectedGrossMargin = round(netRevenue - totalWithContingency);
    const expectedGrossMarginPct = economics.clientPrice > 0 ? expectedGrossMargin / economics.clientPrice : -1;
    computed = { netRevenue, estimatedSpend, contingency, totalWithContingency, expectedGrossMargin, expectedGrossMarginPct };

    if (totalWithContingency > thresholds.maxProductionBudgetUsd) {
      escalate(
        "reject",
        `Generation cost plus contingency ${usd(totalWithContingency)} exceeds the configured production budget ${usd(thresholds.maxProductionBudgetUsd)}.`,
      );
    }

    const pctTxt = `${Math.round(expectedGrossMarginPct * 100)}%`;
    if (expectedGrossMarginPct < thresholds.rejectBelowMarginPct) {
      escalate("reject", `Expected gross margin ${pctTxt} is below the ${Math.round(thresholds.rejectBelowMarginPct * 100)}% floor.`);
    } else if (expectedGrossMarginPct < thresholds.minGrossMarginPct) {
      escalate("human_review", `Expected gross margin ${pctTxt} is under the ${Math.round(thresholds.minGrossMarginPct * 100)}% target — reprice or trim scope.`);
    }
  } else {
    // Never guess a price. Route to a human instead.
    const caps = plan.unpricedCapabilities.length ? ` (${plan.unpricedCapabilities.join(", ")})` : "";
    escalate("human_review", `Required price data is missing for part of the plan${caps} — routing to human review instead of guessing.`);
  }

  // --- Rights & consent --------------------------------------------------
  const nonImpersonation = analysis.rightsAndConsentFlags.filter((f) => f.kind !== "impersonation");
  if (nonImpersonation.length) {
    const kinds = [...new Set(nonImpersonation.map((f) => CONSENT_LABEL[f.kind] ?? f.kind))];
    escalate("human_review", `Human rights/consent check needed: ${kinds.join(", ")}.`);
  }

  // --- Confidence --------------------------------------------------------
  if (analysis.confidence < thresholds.minConfidencePct) {
    escalate("human_review", `Analysis confidence ${analysis.confidence}% is below the ${thresholds.minConfidencePct}% bar.`);
  }

  // --- Reference material ------------------------------------------------
  if (analysis.suppliedAssets.length === 0 || analysis.missingAssets.length > thresholds.maxMissingAssets) {
    escalate("human_review", "Not enough reference material to produce confidently — gather assets or confirm with the client.");
  }

  // --- Deadline ----------------------------------------------------------
  const attempts = plan.steps.reduce((a, s) => a + s.estimatedAttempts, 0);
  const neededDays = Math.ceil(attempts / 60) + 1; // ~60 reviewed attempts/day + 1 feedback day
  if (ctx.deadlineDays < 1) {
    escalate("reject", "Deadline has already passed.");
  } else if (ctx.deadlineDays < neededDays) {
    escalate("human_review", `Deadline in ${ctx.deadlineDays} day(s); the plan needs about ${neededDays}.`);
  }

  // --- Never be less cautious than the model's own suggestion ------------
  const modelRank: Record<string, FinalDecision> = { accept: "accept", human_review: "human_review", reject: "reject" };
  const modelSuggestion = modelRank[analysis.decision] ?? "human_review";
  if (RANK[modelSuggestion] > RANK[decision]) {
    const extra = analysis.decisionReasons[0] ? ` (${analysis.decisionReasons[0]})` : "";
    escalate(modelSuggestion, `Model flagged this as ${analysis.decision}${extra}.`);
  }

  if (decision === "accept") {
    reasons.unshift("Clear deliverable, enough reference material, a plausible deadline and healthy margin — safe to accept.");
  }

  return { decision, reasons, economics: computed };
}
