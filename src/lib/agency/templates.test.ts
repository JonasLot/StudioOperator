import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_TEMPLATES, getTemplate, matchTemplate } from "./templates";

test("three templates, each fully specified for autonomy", () => {
  assert.equal(SERVICE_TEMPLATES.length, 3);
  const ids = SERVICE_TEMPLATES.map((t) => t.id);
  assert.deepEqual([...new Set(ids)], ids); // unique
  for (const t of SERVICE_TEMPLATES) {
    assert.ok(t.requiredInputs.length > 0, `${t.id} inputs`);
    assert.ok(t.acceptedFileTypes.length > 0, `${t.id} file types`);
    assert.ok(t.modelRecipe.length > 0, `${t.id} recipe`);
    assert.ok(t.qualityChecklist.length > 0, `${t.id} checklist`);
    assert.ok(t.includedRevisions >= 1, `${t.id} revisions`);
    assert.ok(t.deliveryPackage.length > 0, `${t.id} delivery`);
    assert.ok(t.targetGrossMarginPct > 0 && t.targetGrossMarginPct < 1, `${t.id} margin`);
    assert.ok(t.maxProductionSpendUsd > 0, `${t.id} max spend`);
    assert.ok(t.escalationConditions.length > 0, `${t.id} escalations`);
  }
});

test("launch-video matches the glass-monument shape", () => {
  const t = getTemplate("launch-video")!;
  assert.equal(t.includedRevisions, 2);
  assert.equal(t.defaultTurnaroundHours, 72);
});

test("matchTemplate routes by keywords", () => {
  assert.equal(matchTemplate("adapt this into five languages with lip sync")?.id, "localization-pack");
  assert.equal(matchTemplate("need a UGC ad pack with three hooks")?.id, "ugc-ad-pack");
  assert.equal(matchTemplate("a short cinematic launch film in two aspect ratios")?.id, "launch-video");
  assert.equal(matchTemplate("something unrelated"), null);
  assert.equal(getTemplate("nope"), null);
});
