import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeRoute, pricePlan, priceRoute, type RouteInput, type StageSelection } from "./route";
import { byRole, ROUTER_CATALOG } from "./catalog";

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    medium: "video",
    needsIdentity: true,
    needsText: true,
    talking: false,
    resolution: "4K",
    durationSec: 60,
    deadlineDays: 14,
    conceptCount: 8,
    keep: 2,
    clientPrice: 4800,
    sourceFeePct: 0.1,
    contingencyPct: 0.2,
    targetMarginPct: 0.45,
    ...overrides,
  };
}

test("catalog groups every model under exactly one role", () => {
  const counts = (["search", "control", "ship", "finish"] as const).map((r) => byRole(r).length);
  assert.equal(counts.reduce((a, b) => a + b, 0), ROUTER_CATALOG.length);
  assert.ok(counts.every((c) => c > 0));
});

test("proposes the full SEARCH→CONTROL→SHIP→repair→FINISH route for a video brief", () => {
  const plan = proposeRoute(input());
  const keys = plan.stages.map((s) => s.key);
  for (const k of ["search", "control", "ship", "repair", "finish"]) assert.ok(keys.includes(k as never), `missing ${k}`);
  assert.ok(plan.stages.find((s) => s.key === "repair")!.optional);
  assert.equal(plan.stages.find((s) => s.key === "search")!.estimatedAttempts, 8);
});

test("SEARCH falls back to the cheapest lane when there are no control needs", () => {
  const plan = proposeRoute(input({ needsIdentity: false, needsText: false }));
  const search = plan.stages.find((s) => s.key === "search")!;
  assert.equal(search.selectedId, "ltx-fast"); // cheapest video concept lane
});

test("SEARCH prefers a reference-capable lane when identity must be preserved", () => {
  const plan = proposeRoute(input({ needsIdentity: true, needsText: false }));
  const search = plan.stages.find((s) => s.key === "search")!;
  assert.equal(search.selectedId, "seedance-fast"); // reference-capable concept lane
});

test("CONTROL respects exact-text + identity needs", () => {
  const control = proposeRoute(input()).stages.find((s) => s.key === "control")!;
  assert.equal(control.selectedId, "qwen-edit"); // text + packaging + reference
});

test("economics: optional repair is excluded from estimate but included in max authorized spend", () => {
  const eco = pricePlan(proposeRoute(input()));
  assert.ok(eco.estimatedSpend > 0);
  assert.ok(eco.maxAuthorizedSpend > eco.estimatedSpend); // contingency + optional repair
  assert.equal(typeof eco.meetsTarget, "boolean");
});

test("manual override recalculates economics instantly (pricier ship raises the ceiling)", () => {
  const plan = proposeRoute(input());
  const base = pricePlan(plan);
  const selections: StageSelection[] = plan.stages.map((s) => ({
    key: s.key, selectedId: s.key === "ship" ? "veo-ship" : s.selectedId,
    estimatedAttempts: s.estimatedAttempts, optional: s.optional, title: s.title, why: s.why, role: s.role, candidateIds: s.candidateIds,
  }));
  const overridden = priceRoute(selections, plan.input);
  assert.ok(overridden.maxAuthorizedSpend > base.maxAuthorizedSpend);
  const ship = overridden.stages.find((s) => s.key === "ship")!;
  assert.equal(ship.model.id, "veo-ship");
  assert.ok(ship.alternative && ship.alternative.id !== "veo-ship"); // an alternative is always offered
});

test("talking brief adds a voice & lip-sync finish stage", () => {
  const plan = proposeRoute(input({ talking: true }));
  const finishes = plan.stages.filter((s) => s.key === "finish");
  assert.ok(finishes.length >= 2); // voice/lipsync + upscale
});

test("image brief ships on an image lane, not video", () => {
  const plan = proposeRoute(input({ medium: "image", talking: false }));
  const ship = plan.stages.find((s) => s.key === "ship")!;
  const model = ROUTER_CATALOG.find((m) => m.id === ship.selectedId)!;
  assert.equal(model.medium, "image");
});
