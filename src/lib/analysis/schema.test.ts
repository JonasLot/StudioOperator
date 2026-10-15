import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnalysis, safeParseAnalysis, type Analysis } from "./schema";

function valid(overrides: Partial<Analysis> = {}): Analysis {
  return {
    jobType: "Concept film",
    conciseSummary: "A 60s hero film plus two cutdowns.",
    deliverables: [
      { name: "Hero film", format: "video", aspectRatio: "16:9", duration: "60s", resolution: "4K", exactTextRequirements: ["Built for the long night."] },
    ],
    suppliedAssets: ["moodboard.pdf"],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: ["Wordmark only, on black."],
    rightsAndConsentFlags: [],
    technicalRisks: ["On-screen text may drift."],
    revisionRisk: "low",
    confidence: 80,
    decision: "accept",
    decisionReasons: ["Clear, feasible brief."],
    proposedWorkflow: [
      { capability: "image_keyframes", description: "Keyframes" },
      { capability: "hero_video", description: "Hero shots" },
    ],
    estimatedAttemptsByStep: [6, 8],
    assumptions: ["Music is client-supplied."],
    ...overrides,
  };
}

test("accepts a well-formed analysis", () => {
  const a = parseAnalysis(valid());
  assert.equal(a.deliverables.length, 1);
  assert.equal(a.proposedWorkflow.length, a.estimatedAttemptsByStep.length);
});

test("rejects a missing required field", () => {
  const missing: Record<string, unknown> = { ...valid() };
  delete missing.confidence;
  const r = safeParseAnalysis(missing);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /confidence/);
});

test("rejects an unknown decision enum value", () => {
  const r = safeParseAnalysis(valid({ decision: "maybe" as Analysis["decision"] }));
  assert.equal(r.ok, false);
});

test("rejects an invalid revisionRisk", () => {
  const r = safeParseAnalysis(valid({ revisionRisk: "critical" as Analysis["revisionRisk"] }));
  assert.equal(r.ok, false);
});

test("rejects confidence out of range", () => {
  assert.equal(safeParseAnalysis(valid({ confidence: 120 })).ok, false);
  assert.equal(safeParseAnalysis(valid({ confidence: -5 })).ok, false);
});

test("rejects a wrong type for an array field", () => {
  const r = safeParseAnalysis(valid({ suppliedAssets: "moodboard.pdf" as unknown as string[] }));
  assert.equal(r.ok, false);
});

test("rejects estimatedAttemptsByStep misaligned with proposedWorkflow", () => {
  const r = safeParseAnalysis(valid({ estimatedAttemptsByStep: [6] })); // 2 steps, 1 attempt
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /estimatedAttemptsByStep/);
});

test("rejects an unknown capability in the workflow", () => {
  const r = safeParseAnalysis(valid({ proposedWorkflow: [{ capability: "teleport" as never, description: "x" }], estimatedAttemptsByStep: [1] }));
  assert.equal(r.ok, false);
});
