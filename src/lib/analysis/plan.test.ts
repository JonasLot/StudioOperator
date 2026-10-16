import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCostPlan } from "./cost";
import { buildWorkflow } from "./plan";
import { mockAnalyze } from "./mock";
import { deriveBriefFacts } from "./view";

const brief = {
  rawBrief:
    'Cinematic 60-second film in 16:9 4K plus two 15s cutdowns at 9:16. End card text: "Built for the long night." Voiceover reads the end line. Brand palette slate and orange.',
  budget: 8000,
  deadline: "2030-01-01",
  source: "direct",
  referenceAssets: ["https://example.com/mood"],
  clientNotes: null,
};

test("the workflow is exactly the priced cost plan", () => {
  const analysis = mockAnalyze(brief);
  const plan = computeCostPlan(analysis, 12);
  const wf = buildWorkflow(plan, deriveBriefFacts(analysis), "job_1", 1, 0.2);

  assert.equal(wf.steps.length, plan.steps.length);
  wf.steps.forEach((s, i) => {
    assert.equal(s.order, i + 1);
    assert.equal(s.modelId, plan.steps[i].modelId);
    assert.equal(s.estimatedAttempts, plan.steps[i].estimatedAttempts);
    assert.equal(s.estimatedTotalCost, plan.steps[i].stepCost);
  });
  assert.equal(wf.estimatedTotalCost, plan.estimatedSpend);
  assert.equal(wf.maxBudget, Math.ceil(plan.estimatedSpend * 1.2));
  assert.equal(wf.approvalStatus, "draft");
});

test("steps point at the deliverables they serve", () => {
  const analysis = mockAnalyze(brief);
  const facts = deriveBriefFacts(analysis);
  const wf = buildWorkflow(computeCostPlan(analysis, 12), facts, "job_1", 1, 0.2);
  const known = new Set(facts.deliverables.map((d) => d.id));
  for (const s of wf.steps) {
    assert.ok(s.deliverableIds.length > 0, `${s.name} has deliverables`);
    for (const id of s.deliverableIds) assert.ok(known.has(id));
  }
  const text = wf.steps.find((s) => s.name.toLowerCase().includes("text"));
  assert.ok(text?.inputs.some((i) => i.includes("Built for the long night.")));
  const vo = wf.steps.find((s) => s.modelId === "voice-tts");
  assert.deepEqual(vo?.deliverableIds, facts.deliverables.filter((d) => d.kind === "voiceover").map((d) => d.id));
});

test("an empty plan yields an empty, zero-budget workflow", () => {
  const analysis = { ...mockAnalyze(brief), proposedWorkflow: [], estimatedAttemptsByStep: [] };
  const wf = buildWorkflow(computeCostPlan(analysis, 12), deriveBriefFacts(analysis), "job_1", 2, 0.2);
  assert.equal(wf.steps.length, 0);
  assert.equal(wf.maxBudget, 0);
  assert.equal(wf.version, 2);
});
