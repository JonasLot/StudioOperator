import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCostPlan } from "./cost";
import type { Analysis } from "./schema";

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    jobType: "Concept film",
    conciseSummary: "x",
    deliverables: [{ name: "Hero", format: "video", aspectRatio: null, duration: null, resolution: null, exactTextRequirements: [] }],
    suppliedAssets: ["a"],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "low",
    confidence: 80,
    decision: "accept",
    decisionReasons: [],
    proposedWorkflow: [
      { capability: "image_keyframes", description: "keyframes" }, // soul-image @ 0.06
      { capability: "hero_video", description: "hero" }, // kling-3-0-pro-t2v @ 1.2
    ],
    estimatedAttemptsByStep: [6, 8],
    assumptions: [],
    ...overrides,
  };
}

test("prices steps from the catalog (model never supplies prices)", () => {
  const plan = computeCostPlan(analysis(), 40);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].modelId, "soul-image");
  assert.equal(plan.steps[0].stepCost, 0.36); // 0.06 * 6
  assert.equal(plan.steps[1].stepCost, 9.6); // 1.2 * 8
  assert.equal(plan.estimatedSpend, 9.96);
  assert.equal(plan.hasAllPrices, true);
  assert.deepEqual(plan.unpricedCapabilities, []);
});

test("clamps estimated attempts to the per-step limit", () => {
  const plan = computeCostPlan(analysis({ estimatedAttemptsByStep: [100, 3] }), 5);
  assert.equal(plan.steps[0].estimatedAttempts, 5); // clamped from 100
  assert.equal(plan.steps[1].estimatedAttempts, 3); // under the limit
  assert.equal(plan.steps[0].stepCost, 0.3); // 0.06 * 5
});

test("an empty workflow is not priceable", () => {
  const plan = computeCostPlan(analysis({ proposedWorkflow: [], estimatedAttemptsByStep: [] }), 40);
  assert.equal(plan.estimatedSpend, 0);
  assert.equal(plan.hasAllPrices, false);
});
