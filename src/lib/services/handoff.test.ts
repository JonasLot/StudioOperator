import { test } from "node:test";
import assert from "node:assert/strict";
import type { BriefView, Generation, Workflow, WorkflowStep } from "@/lib/domain/types";
import { buildStepPrompt, resolveStepHandoff } from "./handoff";

const makeStep = (order: number, id: string, name: string, modelId: string, status: WorkflowStep["status"]): WorkflowStep => ({
  id,
  workflowId: "wf1",
  order,
  name,
  category: modelId.includes("image") ? "image" : "video",
  modelId,
  purpose: `Goal for ${name}`,
  inputs: [`Input for ${name}`],
  expectedOutputs: [],
  deliverableIds: [],
  estimatedAttempts: 2,
  unitCost: 1.0,
  estimatedTotalCost: 2.0,
  status,
  requiresReview: true,
});

const makeTake = (
  id: string,
  stepId: string,
  attempt: number,
  outputUrl: string,
  outputType: "image" | "video",
  reviewStatus: Generation["reviewStatus"],
  selected = false
): Generation => ({
  id,
  jobId: "j1",
  workflowId: "wf1",
  stepId,
  revisionId: null,
  attempt,
  provider: "mock",
  providerRequestId: null,
  statusUrl: null,
  model: "mock-model",
  prompt: `Take ${attempt} prompt for ${stepId}`,
  status: "completed",
  costEstimate: 1,
  actualCost: 1,
  outputUrl,
  outputType,
  selected,
  reviewStatus,
  reviewNote: null,
  error: null,
  timedOutAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:01:00Z",
});

test("resolveStepHandoff prioritizes approved takes over selected takes", () => {
  const step1 = makeStep(1, "s1", "Keyframe Stills", "soul-image", "done");
  const step2 = makeStep(2, "s2", "Hero Video", "kling-3-0-std-i2v", "pending");
  const wf = { steps: [step1, step2] } as Workflow;

  // Take 1 was selected automatically by default, but Take 2 was approved by operator
  const take1 = makeTake("g1", "s1", 1, "https://cdn.example.com/take1.png", "image", "pending", true);
  const take2 = makeTake("g2", "s1", 2, "https://cdn.example.com/take2.png", "image", "approved", true);

  const handoff = resolveStepHandoff(wf, [take1, take2], step2);
  assert.equal(handoff.from?.id, "s1");
  assert.equal(handoff.takeAttempt, 2);
  assert.deepEqual(handoff.urls, ["https://cdn.example.com/take2.png"]);
  assert.equal(handoff.reviewStatus, "approved");
});

test("resolveStepHandoff correctly handles relative /api/ URLs in mock mode", () => {
  const step1 = makeStep(1, "s1", "Keyframe Stills", "soul-image", "done");
  const step2 = makeStep(2, "s2", "Hero Video", "seedance-2-0-t2v", "pending");
  const wf = { steps: [step1, step2] } as Workflow;

  const take1 = makeTake("g1", "s1", 1, "/api/mock-output/g1", "image", "approved", true);

  const handoff = resolveStepHandoff(wf, [take1], step2, { mockMode: true });
  assert.equal(handoff.from?.id, "s1");
  assert.equal(handoff.urls[0], "http://localhost:3000/api/mock-output/g1");
  assert.equal(handoff.note, null);
});

test("resolveStepHandoff prepends publicBaseUrl in production", () => {
  const step1 = makeStep(1, "s1", "Keyframe Stills", "soul-image", "done");
  const step2 = makeStep(2, "s2", "Hero Video", "seedance-2-0-t2v", "pending");
  const wf = { steps: [step1, step2] } as Workflow;

  const take1 = makeTake("g1", "s1", 1, "/api/asset/g1.png", "image", "approved", true);

  const handoff = resolveStepHandoff(wf, [take1], step2, { publicBaseUrl: "https://studio.example.com" });
  assert.equal(handoff.urls[0], "https://studio.example.com/api/asset/g1.png");
  assert.equal(handoff.note, null);
});

test("resolveStepHandoff finds image keyframes for image-to-video models when intermediate step was video", () => {
  const step1 = makeStep(1, "s1", "Keyframe Stills", "soul-image", "done");
  const step2 = makeStep(2, "s2", "Hero Video", "kling-3-0-pro-t2v", "done");
  const step3 = makeStep(3, "s3", "Secondary Animation", "kling-3-0-std-i2v", "pending");
  const wf = { steps: [step1, step2, step3] } as Workflow;

  const take1 = makeTake("g1", "s1", 1, "https://cdn.example.com/still.png", "image", "approved", true);
  const take2 = makeTake("g2", "s2", 1, "https://cdn.example.com/clip.mp4", "video", "approved", true);

  // step 3 is kling-3-0-std-i2v (image to video), so it should look back to find step 1's approved image
  const handoff = resolveStepHandoff(wf, [take1, take2], step3);
  assert.equal(handoff.from?.id, "s1");
  assert.equal(handoff.outputType, "image");
});

test("buildStepPrompt builds rich prompt with continuity, creative brief, and must-haves", () => {
  const step = makeStep(2, "s2", "Hero Shot", "kling-3-0-pro-t2v", "running");
  const step1 = makeStep(1, "s1", "Keyframe Look", "soul-image", "done");

  const handoff = {
    urls: ["https://cdn.example.com/keyframe.png"],
    from: step1,
    takeAttempt: 2,
    takePrompt: "Vibrant dawn lighting on sleek matte bottle",
    outputType: "image" as const,
    reviewStatus: "approved" as const,
    note: null,
  };

  const analysis: BriefView = {
    id: "a1",
    jobId: "j1",
    summary: "30s product launch for Lumina coffee machine",
    dimensions: ["16:9", "4K"],
    brandConstraints: ["Never show competing brands", "Use Pantone 296 C"],
    exactText: ["Lumina 2026"],
    confidence: 0.9,
    rightsConcerns: [],
    references: ["Dark marble countertop", "Morning sunlight angle"],
    durations: ["30s"],
    missingInformation: [],
    deliverables: [],
    analyzer: "gpt-6-astra",
    decision: "accept",
    rationale: ["Clear scope"],
    createdAt: "2026-01-01T00:00:00Z",
  };

  const creative = "Creative Direction:\nLogline: Pure morning ritual.\nTone: Premium, calm, sensory.\nMust-haves: Close-up of espresso pour; Steam rising against dark backdrop";
  const prompt = buildStepPrompt({
    step,
    analysis,
    attempt: 1,
    creative,
    refInfo: handoff,
  });

  assert.ok(prompt.includes("Goal for Hero Shot"), "includes step purpose");
  assert.ok(prompt.includes("Inputs: Input for Hero Shot"), "includes inputs");
  assert.ok(prompt.includes("Continuity & handoff: building on Step 1 “Keyframe Look” (approved take)."), "includes continuity");
  assert.ok(prompt.includes("Prior visual anchor: Vibrant dawn lighting on sleek matte bottle"), "includes visual anchor");
  assert.ok(prompt.includes("Creative Direction:"), "includes creative direction");
  assert.ok(prompt.includes("Brief: 30s product launch for Lumina coffee machine"), "includes brief summary");
  assert.ok(prompt.includes("Reference cues: Dark marble countertop; Morning sunlight angle"), "includes reference cues");
  assert.ok(prompt.includes("Must-haves: Close-up of espresso pour; Steam rising against dark backdrop"), "includes must-haves from creative");
  assert.ok(prompt.includes("Format: 16:9, 4K"), "includes format");
  assert.ok(prompt.includes("Constraints: Never show competing brands; Use Pantone 296 C"), "includes constraints");
  assert.ok(prompt.includes("Take 1."), "includes attempt");
});
