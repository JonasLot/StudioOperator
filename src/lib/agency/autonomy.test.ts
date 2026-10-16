import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutonomySettings } from "@/lib/domain/types";
import { defaultAlwaysPause, messageAutoAllowed, modelFamily, modelFamilyAllowed, triggeredPauses } from "./autonomy";

function settings(over: Partial<AutonomySettings> = {}): AutonomySettings {
  return {
    id: "default",
    maxAutoSpendPerJobUsd: 60,
    maxAutoSpendPerRepairUsd: 8,
    maxAttemptsPerStep: 16,
    allowedModelFamilies: ["soul", "cinema", "edit", "upscale"],
    autoSendMessageTypes: ["progress_update"],
    autoShareConcepts: false,
    finalDeliveryAlwaysApproval: true,
    alwaysPause: defaultAlwaysPause(),
    updatedAt: "t",
    ...over,
  };
}

test("marketplace is never auto-sent, whatever the settings", () => {
  const s = settings({ autoSendMessageTypes: ["progress_update", "proposal", "delivery"] });
  assert.equal(messageAutoAllowed(s, "progress_update", "marketplace").allowed, false);
  assert.equal(messageAutoAllowed(s, "proposal", "marketplace").allowed, false);
});

test("direct email honours the auto-send list", () => {
  const s = settings();
  assert.equal(messageAutoAllowed(s, "progress_update", "direct_email").allowed, true);
  assert.equal(messageAutoAllowed(s, "proposal", "direct_email").allowed, false);
});

test("delivery and concepts respect their own switches", () => {
  const s = settings({ autoSendMessageTypes: ["delivery", "concept_presentation"] });
  assert.equal(messageAutoAllowed(s, "delivery", "direct_email").allowed, false); // finalDeliveryAlwaysApproval
  assert.equal(messageAutoAllowed(s, "concept_presentation", "direct_email").allowed, false); // autoShareConcepts off
  const s2 = settings({ autoSendMessageTypes: ["concept_presentation"], autoShareConcepts: true });
  assert.equal(messageAutoAllowed(s2, "concept_presentation", "direct_email").allowed, true);
});

test("model families", () => {
  assert.equal(modelFamily("kling-o3-image-ref"), "kling");
  assert.equal(modelFamily("soul-image"), "soul");
  assert.equal(modelFamilyAllowed(settings(), "soul-image"), true);
  assert.equal(modelFamilyAllowed(settings(), "kling-o3-image-ref"), false);
});

test("triggeredPauses only returns enabled AND tripped conditions", () => {
  const base = { hasLikenessOrVoice: false, unclearOwnership: false, factualClaims: false, regulatedCopy: false, expectedMarginPct: 0.5, deadlineRisk: false, clientDispute: false };
  assert.deepEqual(triggeredPauses(settings(), base), []);
  assert.deepEqual(triggeredPauses(settings(), { ...base, hasLikenessOrVoice: true }), ["likeness_or_voice"]);
  assert.deepEqual(triggeredPauses(settings(), { ...base, expectedMarginPct: -0.1 }), ["negative_margin"]);
  // disabled condition is not returned even when tripped
  const s = settings({ alwaysPause: { ...defaultAlwaysPause(), negative_margin: false } });
  assert.deepEqual(triggeredPauses(s, { ...base, expectedMarginPct: -0.1 }), []);
});
