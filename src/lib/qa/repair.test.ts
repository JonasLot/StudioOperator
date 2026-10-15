import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRepair, type RepairContext, type RepairLimits } from "./repair";
import type { QaReport } from "./qa";

const LIMITS: RepairLimits = { perRepairMaxUsd: 10, perJobRepairMaxUsd: 25, maxAutoRepairsPerJob: 2 };
const report: QaReport = { verdict: "controlled_edit", summary: "x", checks: [] };

function ctx(overrides: Partial<RepairContext> = {}): RepairContext {
  return {
    modelId: "kling-ship", modelLabel: "Kling O3", unitCostUsd: 1.2, attempts: 2,
    jobRepairSpentUsd: 0, autoRepairsSoFar: 0, priorTotalUsd: 40, clientPriceUsd: 4800, netRevenueUsd: 4320, remainingCapUsd: 200,
    ...overrides,
  };
}

test("within all limits → auto-repair allowed, with full economics", () => {
  const d = decideRepair(report, "continuity break", ctx(), LIMITS);
  assert.equal(d.recommended, true);
  assert.equal(d.auto, true);
  assert.equal(d.needsApproval, false);
  assert.equal(d.incrementalCostUsd, 2.4); // 1.2 * 2
  assert.equal(d.newTotalUsd, 42.4);
  assert.equal(d.blockedBy, null);
  assert.equal(d.newMarginUsd, 4277.6); // 4320 − 42.4
});

test("over the per-repair limit → needs approval, blocked reason given", () => {
  const d = decideRepair(report, "r", ctx({ unitCostUsd: 6, attempts: 2 }), LIMITS); // 12 > 10
  assert.equal(d.auto, false);
  assert.equal(d.needsApproval, true);
  assert.match(d.blockedBy ?? "", /per-repair/);
});

test("over the per-job repair budget → needs approval", () => {
  const d = decideRepair(report, "r", ctx({ jobRepairSpentUsd: 24, unitCostUsd: 1, attempts: 2 }), LIMITS); // 24+2 > 25
  assert.equal(d.auto, false);
  assert.match(d.blockedBy ?? "", /per-job/);
});

test("too many prior auto-repairs → needs approval", () => {
  const d = decideRepair(report, "r", ctx({ autoRepairsSoFar: 2 }), LIMITS);
  assert.equal(d.auto, false);
  assert.match(d.blockedBy ?? "", /auto-repairs/);
});

test("exceeding the remaining approved cap → needs approval", () => {
  const d = decideRepair(report, "r", ctx({ remainingCapUsd: 1, unitCostUsd: 1.2, attempts: 2 }), LIMITS);
  assert.equal(d.auto, false);
  assert.match(d.blockedBy ?? "", /cap/);
});

test("a delivery-review report recommends no repair", () => {
  const d = decideRepair({ verdict: "delivery_review", summary: "", checks: [] }, "r", ctx(), LIMITS);
  assert.equal(d.recommended, false);
  assert.equal(d.auto, false);
});
