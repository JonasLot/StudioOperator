import { test } from "node:test";
import assert from "node:assert/strict";
import type { QaCheck, QaReport } from "@/lib/qa/qa";
import { decideSelfRepair, type SelfRepairContext } from "./self-repair";

function report(checks: Partial<QaCheck>[], verdict: QaReport["verdict"] = "controlled_edit"): QaReport {
  return {
    verdict,
    summary: "test",
    checks: checks.map((c, i) => ({ id: `c${i}`, label: c.label ?? "x", group: c.group ?? "perceptual", status: c.status ?? "pass", detail: "", heuristic: true, ...c })) as QaCheck[],
  };
}

function ctx(over: Partial<SelfRepairContext> = {}): SelfRepairContext {
  return {
    unitCostUsd: 1.6,
    attempts: 2,
    maxAutoSpendPerRepairUsd: 8,
    maxAutoSpendPerJobUsd: 60,
    autoSpentThisJobUsd: 0,
    remainingJobBudgetUsd: 40,
    modelFamilyAllowed: true,
    introducesNewConcern: null,
    ...over,
  };
}

test("a continuity warn within limits repairs automatically", () => {
  const d = decideSelfRepair(report([{ group: "perceptual", status: "warn", label: "Continuity & spatial consistency" }]), ctx());
  assert.equal(d.recommendedAction, "targeted_edit");
  assert.equal(d.auto, true);
  assert.equal(d.incrementalCostUsd, 3.2);
  assert.equal(d.escalationReason, null);
});

test("over the per-repair limit escalates instead of acting", () => {
  const d = decideSelfRepair(report([{ group: "perceptual", status: "warn", label: "Continuity & spatial consistency" }]), ctx({ unitCostUsd: 6 }));
  assert.equal(d.auto, false);
  assert.equal(d.recommendedAction, "escalate");
  assert.match(d.escalationReason ?? "", /per-repair/);
});

test("a fix that introduces a new identity concern always escalates", () => {
  const d = decideSelfRepair(report([{ group: "perceptual", status: "fail", label: "Faces & identity" }]), ctx({ introducesNewConcern: "identity" }));
  assert.equal(d.auto, false);
  assert.match(d.escalationReason ?? "", /identity/);
});

test("a disallowed model family escalates", () => {
  const d = decideSelfRepair(report([{ group: "perceptual", status: "warn", label: "Motion & camera" }]), ctx({ modelFamilyAllowed: false }));
  assert.equal(d.auto, false);
  assert.match(d.escalationReason ?? "", /family/);
});

test("a distorted face regenerates the one shot", () => {
  const d = decideSelfRepair(report([{ group: "perceptual", status: "fail", label: "Faces & identity" }], "regenerate"), ctx());
  assert.equal(d.recommendedAction, "regenerate_shot");
  assert.equal(d.auto, true);
});

test("over the remaining job budget escalates", () => {
  const d = decideSelfRepair(report([{ group: "deliverable", status: "fail", label: "Aspect ratio" }], "regenerate"), ctx({ remainingJobBudgetUsd: 1 }));
  assert.equal(d.auto, false);
  assert.match(d.escalationReason ?? "", /remaining/);
});
