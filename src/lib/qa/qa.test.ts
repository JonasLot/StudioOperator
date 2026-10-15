import { test } from "node:test";
import assert from "node:assert/strict";
import { assessOutput, primaryIssue, type QaInput } from "./qa";

function base(overrides: Partial<QaInput> = {}): QaInput {
  return {
    deliverableName: "Hero film",
    deliverableType: "video",
    gotType: "video",
    wantAspectRatios: ["16:9"],
    gotAspectRatio: "16:9",
    wantResolution: "4K",
    gotResolution: "4K",
    wantDurationSec: 60,
    gotDurationSec: 60,
    exactText: [],
    brandConstraints: [],
    prohibited: [],
    requiredScenes: [],
    relevantPerceptual: [],
    seed: "gen_clean_0",
    ...overrides,
  };
}

/** Find a seed that produces a given verdict for a template (perceptual flagging is seed-driven). */
function seedFor(template: Partial<QaInput>, want: string): string {
  for (let i = 0; i < 400; i++) {
    const seed = `seed_${i}`;
    if (assessOutput(base({ ...template, seed })).verdict === want) return seed;
  }
  throw new Error(`no seed produced ${want}`);
}

test("all structural checks pass with no perceptual needs → ready for delivery review", () => {
  // Use a template with no perceptual/text/brand items so the verdict is stable.
  let seen = false;
  for (let i = 0; i < 50 && !seen; i++) {
    if (assessOutput(base({ seed: `clean_${i}` })).verdict === "delivery_review") seen = true;
  }
  assert.ok(seen, "a clean output should reach delivery_review");
});

test("wrong deliverable type → regenerate", () => {
  const r = assessOutput(base({ gotType: "image" }));
  assert.equal(r.verdict, "regenerate");
  assert.equal(r.checks.find((c) => c.id === "type")!.status, "fail");
});

test("wrong aspect ratio fails the deliverable check", () => {
  const r = assessOutput(base({ gotAspectRatio: "1:1" }));
  assert.equal(r.checks.find((c) => c.id === "aspect")!.status, "fail");
});

test("a flagged continuity issue yields a controlled-edit verdict with a primary issue", () => {
  const seed = seedFor({ relevantPerceptual: ["continuity"] }, "controlled_edit");
  const r = assessOutput(base({ relevantPerceptual: ["continuity"], seed }));
  assert.equal(r.verdict, "controlled_edit");
  const issue = primaryIssue(r);
  assert.ok(issue, "controlled_edit should expose a primary issue to repair");
});

test("exact-text and prohibited checks appear when the brief requires them", () => {
  const r = assessOutput(base({ exactText: ["Built for the long night."], prohibited: ["competitor gear"], requiredScenes: ["blue hour"] }));
  assert.ok(r.checks.some((c) => c.group === "text"));
  assert.ok(r.checks.some((c) => c.id === "prohibited"));
  assert.ok(r.checks.some((c) => c.id === "scenes"));
});

test("report is deterministic for the same seed", () => {
  const a = assessOutput(base({ relevantPerceptual: ["motion", "continuity"], seed: "fixed" }));
  const b = assessOutput(base({ relevantPerceptual: ["motion", "continuity"], seed: "fixed" }));
  assert.deepEqual(a, b);
});
