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
  const cheapest = byRole("search").filter((m) => m.medium === "video").sort((a, b) => a.costPerAttemptUsd - b.costPerAttemptUsd)[0];
  assert.equal(search.selectedId, cheapest.id); // cheapest video concept lane
});

test("SEARCH prefers a reference-capable lane when identity must be preserved", () => {
  const plan = proposeRoute(input({ needsIdentity: true, needsText: false }));
  const search = plan.stages.find((s) => s.key === "search")!;
  const model = ROUTER_CATALOG.find((m) => m.id === search.selectedId)!;
  assert.ok(model.controls.reference || model.controls.identity);
  const cheapestReference = byRole("search").filter((m) => m.medium === "video" && (m.controls.reference || m.controls.identity)).sort((a, b) => a.costPerAttemptUsd - b.costPerAttemptUsd)[0];
  assert.equal(search.selectedId, cheapestReference.id); // cheapest reference-capable concept lane
});

test("CONTROL respects exact-text + identity needs", () => {
  const control = proposeRoute(input()).stages.find((s) => s.key === "control")!;
  const model = ROUTER_CATALOG.find((m) => m.id === control.selectedId)!;
  assert.ok(model.controls.text && (model.controls.reference || model.controls.identity)); // text + packaging + reference
  const best = byRole("control")
    .filter((m) => m.medium === "image" && m.controls.text && (m.controls.reference || m.controls.identity))
    .sort((a, b) => a.costPerAttemptUsd - b.costPerAttemptUsd)[0];
  assert.equal(control.selectedId, best.id); // cheapest generator that satisfies both needs
  assert.notEqual(model.medium, "image_edit"); // inpaint models (need a mask) are alternatives only
});

test("SHIP honours the requested resolution (4K does not land on a 1080p-max model)", () => {
  const ship = proposeRoute(input({ resolution: "4K" })).stages.find((s) => s.key === "ship")!;
  assert.equal(ship.selectedId, "kling-3-0");
  assert.equal(ROUTER_CATALOG.find((m) => m.id === ship.selectedId)!.maxResolution, "4k");
  const hd = proposeRoute(input({ resolution: "1080p" })).stages.find((s) => s.key === "ship")!;
  assert.ok(ROUTER_CATALOG.find((m) => m.id === hd.selectedId)!.maxResolution !== "720p");
});

test("SHIP attempts scale with duration: 60s on 5s clips = 12 clips x keep x 2 takes", () => {
  const long = proposeRoute(input({ durationSec: 60 })).stages.find((s) => s.key === "ship")!;
  assert.equal(long.estimatedAttempts, 12 * 2 * 2);
  const short = proposeRoute(input({ durationSec: 5 })).stages.find((s) => s.key === "ship")!;
  assert.equal(short.estimatedAttempts, 1 * 2 * 2);
});

test("FINISH prefers a quality upscaler for 4K, the cheap one for HD", () => {
  const finishOf = (resolution: string) => proposeRoute(input({ resolution })).stages.filter((s) => s.key === "finish").at(-1)!.selectedId;
  assert.equal(finishOf("4K"), "topaz-video");
  assert.equal(finishOf("1080p"), "video-upscale");
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
    key: s.key, selectedId: s.key === "ship" ? "veo-3-1" : s.selectedId,
    estimatedAttempts: s.estimatedAttempts, optional: s.optional, title: s.title, why: s.why, role: s.role, candidateIds: s.candidateIds,
  }));
  const overridden = priceRoute(selections, plan.input);
  assert.ok(overridden.maxAuthorizedSpend > base.maxAuthorizedSpend);
  const ship = overridden.stages.find((s) => s.key === "ship")!;
  assert.equal(ship.model.id, "veo-3-1");
  assert.ok(ship.alternative && ship.alternative.id !== "veo-3-1"); // an alternative is always offered
});

test("talking brief adds a voice finish stage", () => {
  const plan = proposeRoute(input({ talking: true }));
  const finishes = plan.stages.filter((s) => s.key === "finish");
  assert.ok(finishes.length >= 2); // voice + upscale
});

test("image brief ships on an image lane, not video", () => {
  const plan = proposeRoute(input({ medium: "image", talking: false }));
  const ship = plan.stages.find((s) => s.key === "ship")!;
  const model = ROUTER_CATALOG.find((m) => m.id === ship.selectedId)!;
  assert.equal(model.medium, "image");
});

test("every catalog entry is in Higgsfield's model list and has a unique id and job type", () => {
  assert.ok(ROUTER_CATALOG.every((m) => m.listed && m.jobType.length > 0));
  assert.equal(new Set(ROUTER_CATALOG.map((m) => m.id)).size, ROUTER_CATALOG.length);
});

test("finish upscale matches the medium: stills get an image upscaler, video gets a video upscaler", () => {
  const upscaleOf = (medium: "image" | "video") => {
    const stage = proposeRoute(input({ medium })).stages.filter((s) => s.key === "finish").at(-1)!;
    return ROUTER_CATALOG.find((m) => m.id === stage.selectedId)!;
  };
  assert.equal(upscaleOf("image").medium, "upscale_image");
  assert.equal(upscaleOf("video").medium, "upscale");
});
