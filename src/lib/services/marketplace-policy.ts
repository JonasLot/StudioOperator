import type { JobSource } from "@/lib/domain/types";
import { GuardrailError } from "./guardrails";

/**
 * Marketplace boundary.
 *
 * &more Design never talks to Upwork, Fiverr, Contra or any other marketplace. Briefs arrive by
 * paste; proposals, contracts, messages and deliveries happen by hand in the marketplace itself.
 *
 * To automate one of these actions later, a future change must add an explicit, human-approved
 * integration for that exact action and source here — nothing else in the codebase may call out.
 */
export const MARKETPLACE_ACTIONS = [
  "scrape_listing",
  "submit_proposal",
  "accept_contract",
  "send_marketplace_message",
  "deliver_via_marketplace",
] as const;
export type MarketplaceAction = (typeof MARKETPLACE_ACTIONS)[number];

export const APPROVED_MARKETPLACE_INTEGRATIONS: ReadonlyArray<{ action: MarketplaceAction; source: JobSource }> = [];

export function assertMarketplaceActionAllowed(action: MarketplaceAction, source: JobSource): never | void {
  const ok = APPROVED_MARKETPLACE_INTEGRATIONS.some((i) => i.action === action && i.source === source);
  if (!ok) {
    throw new GuardrailError(`"${action}" on ${source} is a manual step. &more Design has no approved integration for it.`);
  }
}

export const MANUAL_MARKETPLACE_STEPS: Record<"before" | "after", { action: MarketplaceAction; label: string }[]> = {
  before: [
    { action: "submit_proposal", label: "Send proposal / quote yourself" },
    { action: "accept_contract", label: "Accept the contract yourself" },
  ],
  after: [{ action: "deliver_via_marketplace", label: "Upload final files to the client yourself" }],
};
