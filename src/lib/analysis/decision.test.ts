import { test } from "node:test";
import assert from "node:assert/strict";
import { decideJob, type DecisionThresholds } from "./decision";
import type { CostPlan } from "./cost";
import type { Analysis } from "./schema";

const THRESHOLDS: DecisionThresholds = {
  minGrossMarginPct: 0.45,
  rejectBelowMarginPct: 0.15,
  maxProductionBudgetUsd: 2000,
  minConfidencePct: 55,
  maxMissingAssets: 2,
};

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    jobType: "Concept film",
    conciseSummary: "x",
    deliverables: [{ name: "Hero", format: "video", aspectRatio: null, duration: null, resolution: null, exactTextRequirements: [] }],
    suppliedAssets: ["moodboard.pdf"],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "low",
    confidence: 85,
    decision: "accept",
    decisionReasons: [],
    proposedWorkflow: [{ capability: "image_keyframes", description: "k" }],
    estimatedAttemptsByStep: [10],
    assumptions: [],
    ...overrides,
  };
}

function mkPlan(estimatedSpend: number, opts: Partial<CostPlan> = {}): CostPlan {
  return {
    steps: [{ capability: "image_keyframes", label: "Image keyframes", description: "k", modelId: "soul-image", unitCostUsd: 0.06, estimatedAttempts: 10, stepCost: estimatedSpend }],
    estimatedSpend,
    unpricedCapabilities: [],
    hasAllPrices: true,
    attemptLimitPerStep: 40,
    ...opts,
  };
}

const econ = { clientPrice: 4800, sourceFeePct: 0.1, contingencyPct: 0.2 };

test("accepts a clear, well-referenced, profitable job in time", () => {
  const r = decideJob(analysis(), mkPlan(20), econ, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "accept");
  assert.ok(r.economics);
});

test("rejects deceptive impersonation outright", () => {
  const r = decideJob(
    analysis({ rightsAndConsentFlags: [{ kind: "impersonation", detail: "fake president endorsement" }] }),
    mkPlan(20),
    econ,
    THRESHOLDS,
    { deadlineDays: 30 },
  );
  assert.equal(r.decision, "reject");
  assert.ok(r.reasons.some((x) => /impersonation/i.test(x)));
});

test("routes licensed music / rights flags to human review", () => {
  const r = decideJob(
    analysis({ rightsAndConsentFlags: [{ kind: "licensed_music", detail: "wants a specific hit song" }] }),
    mkPlan(20),
    econ,
    THRESHOLDS,
    { deadlineDays: 30 },
  );
  assert.equal(r.decision, "human_review");
});

test("rejects when generation cost + contingency exceeds the production budget", () => {
  // High client price keeps margin healthy, so only the budget cap can trip the reject.
  const r = decideJob(analysis(), mkPlan(2000), { ...econ, clientPrice: 100000 }, THRESHOLDS, { deadlineDays: 60 });
  assert.equal(r.decision, "reject");
  assert.ok(r.reasons.some((x) => /production budget/i.test(x)));
});

test("routes to human review when price data is missing (never guesses)", () => {
  const plan = mkPlan(0, { steps: [], hasAllPrices: false, unpricedCapabilities: ["hero_video"] });
  const r = decideJob(analysis(), plan, econ, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "human_review");
  assert.ok(r.reasons.some((x) => /missing/i.test(x)));
  assert.equal(r.economics, null);
});

test("rejects when margin is below the floor", () => {
  const r = decideJob(analysis(), mkPlan(80), { clientPrice: 100, sourceFeePct: 0, contingencyPct: 0.2 }, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "reject");
  assert.ok(r.reasons.some((x) => /margin/i.test(x)));
});

test("routes to human review when margin is under target but above the floor", () => {
  const r = decideJob(analysis(), mkPlan(50), { clientPrice: 100, sourceFeePct: 0, contingencyPct: 0.2 }, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "human_review"); // margin 40% (<45% target, >15% floor)
});

test("routes low-confidence analyses to human review", () => {
  const r = decideJob(analysis({ confidence: 40 }), mkPlan(20), econ, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "human_review");
});

test("rejects a passed deadline", () => {
  const r = decideJob(analysis(), mkPlan(20), econ, THRESHOLDS, { deadlineDays: 0 });
  assert.equal(r.decision, "reject");
});

test("routes to human review without enough reference material", () => {
  const r = decideJob(analysis({ suppliedAssets: [], missingAssets: ["brand kit", "references", "music", "script"] }), mkPlan(20), econ, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "human_review");
});

test("never less cautious than the model's own suggestion", () => {
  const r = decideJob(analysis({ decision: "human_review", decisionReasons: ["model is unsure about scope"] }), mkPlan(20), econ, THRESHOLDS, { deadlineDays: 30 });
  assert.equal(r.decision, "human_review");
});
