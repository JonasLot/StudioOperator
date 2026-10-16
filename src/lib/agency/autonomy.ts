// ===========================================================================
// Autonomy rules. Pure predicates over the account-level AutonomySettings that
// decide what the agent may do without a human: which messages may be sent,
// whether concepts may be shared, whether a model family is allowed, and which
// "always pause" conditions are tripped by a job's context. No I/O; unit-tested.
// ===========================================================================

import type { AutonomySettings, MessageChannel, MessageType, PauseCondition } from "@/lib/domain/types";
import { PAUSE_CONDITIONS } from "@/lib/domain/types";

/** Every pause condition on by default — the human opts out deliberately, not by omission. */
export function defaultAlwaysPause(): Record<PauseCondition, boolean> {
  return Object.fromEntries(PAUSE_CONDITIONS.map((c) => [c, true])) as Record<PauseCondition, boolean>;
}

export interface AutonomyDefaults {
  maxAutoSpendPerJobUsd: number;
  maxAutoSpendPerRepairUsd: number;
  maxAttemptsPerStep: number;
  allowedModelFamilies: string[];
  autoSendMessageTypes: string[];
  autoShareConcepts: boolean;
  finalDeliveryAlwaysApproval: boolean;
}

export function makeDefaultAutonomy(d: AutonomyDefaults, nowIso: string): AutonomySettings {
  return {
    id: "default",
    maxAutoSpendPerJobUsd: d.maxAutoSpendPerJobUsd,
    maxAutoSpendPerRepairUsd: d.maxAutoSpendPerRepairUsd,
    maxAttemptsPerStep: d.maxAttemptsPerStep,
    allowedModelFamilies: [...d.allowedModelFamilies],
    autoSendMessageTypes: d.autoSendMessageTypes as MessageType[],
    autoShareConcepts: d.autoShareConcepts,
    finalDeliveryAlwaysApproval: d.finalDeliveryAlwaysApproval,
    alwaysPause: defaultAlwaysPause(),
    updatedAt: nowIso,
  };
}

/** The model "family" is the id prefix before the first hyphen (soul-image → soul). */
export function modelFamily(modelId: string): string {
  return modelId.split("-")[0];
}

export function modelFamilyAllowed(settings: AutonomySettings, modelId: string): boolean {
  return settings.allowedModelFamilies.includes(modelFamily(modelId));
}

/**
 * Whether a message of this type may be SENT automatically on this channel.
 * Third-party marketplaces are never auto-sent without an approved integration,
 * regardless of settings. Concept presentations also honour autoShareConcepts.
 */
export function messageAutoAllowed(
  settings: AutonomySettings,
  type: MessageType,
  channel: MessageChannel,
): { allowed: boolean; reason: string | null } {
  if (channel === "marketplace") {
    return { allowed: false, reason: "Third-party marketplace — no approved send integration; drafted for you." };
  }
  if (type === "delivery" && settings.finalDeliveryAlwaysApproval) {
    return { allowed: false, reason: "Final delivery always requires your approval." };
  }
  if (type === "concept_presentation" && !settings.autoShareConcepts) {
    return { allowed: false, reason: "Sharing concepts automatically is turned off." };
  }
  if (!settings.autoSendMessageTypes.includes(type)) {
    return { allowed: false, reason: "This message type is set to draft for approval." };
  }
  return { allowed: true, reason: null };
}

export function conceptsAutoAllowed(settings: AutonomySettings): boolean {
  return settings.autoShareConcepts;
}

export function deliveryNeedsApproval(settings: AutonomySettings): boolean {
  return settings.finalDeliveryAlwaysApproval;
}

export interface PauseContext {
  hasLikenessOrVoice: boolean;
  unclearOwnership: boolean;
  factualClaims: boolean;
  regulatedCopy: boolean;
  expectedMarginPct: number; // may be negative
  deadlineRisk: boolean;
  clientDispute: boolean;
}

/** The subset of always-pause conditions that are both enabled AND tripped by this job. */
export function triggeredPauses(settings: AutonomySettings, ctx: PauseContext): PauseCondition[] {
  const tripped: Record<PauseCondition, boolean> = {
    likeness_or_voice: ctx.hasLikenessOrVoice,
    unclear_ownership: ctx.unclearOwnership,
    factual_claims: ctx.factualClaims,
    packaging_or_regulated: ctx.regulatedCopy,
    negative_margin: ctx.expectedMarginPct < 0,
    deadline_risk: ctx.deadlineRisk,
    client_dispute: ctx.clientDispute,
  };
  return PAUSE_CONDITIONS.filter((c) => settings.alwaysPause[c] && tripped[c]);
}
