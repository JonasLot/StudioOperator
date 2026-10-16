// ===========================================================================
// Supervised self-repair loop. Given a QA report on one output and the current
// autonomy / budget / rights context, decide the SMALLEST action that fixes the
// smallest failed component — and whether the agent may do it automatically.
//
// The agent continues on its own ONLY when the action is inside the pre-approved
// spend limit AND introduces no new rights, factual or identity concern.
// Everything else escalates to the human with a recommended action.
//
// Pure (no I/O): the server layer runs the action or opens an escalation.
// ===========================================================================

import type { QaCheck, QaReport } from "@/lib/qa/qa";

export type RepairAction = "targeted_edit" | "regenerate_shot" | "change_model" | "ask_client" | "escalate";

export interface SelfRepairContext {
  unitCostUsd: number; // cost per attempt of the repair model
  attempts: number; // attempts the repair would use
  maxAutoSpendPerRepairUsd: number;
  maxAutoSpendPerJobUsd: number;
  autoSpentThisJobUsd: number; // automatic spend already incurred on this job
  remainingJobBudgetUsd: number; // room left under the human-approved cap
  modelFamilyAllowed: boolean;
  // Non-null when the only viable fix would introduce a NEW concern (e.g. a
  // regeneration that would add a real-person likeness). Always escalates.
  introducesNewConcern: "rights" | "factual" | "identity" | null;
}

export interface SelfRepairDecision {
  recommendedAction: RepairAction;
  auto: boolean;
  smallestFailedComponent: string | null;
  incrementalCostUsd: number;
  withinSpendLimit: boolean;
  recommendation: string; // what a human should do / what the agent is doing
  escalationReason: string | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The single smallest failed component to fix: a hard fail first, then a warn. */
function smallestFailure(report: QaReport): QaCheck | null {
  const order = ["fail", "warn"] as const;
  const groups = ["deliverable", "text", "perceptual", "scenes", "brand"];
  for (const st of order) {
    for (const g of groups) {
      const c = report.checks.find((x) => x.status === st && x.group === g);
      if (c) return c;
    }
  }
  return null;
}

/** Map a failed component to the smallest production action that addresses it. */
function actionFor(check: QaCheck | null): RepairAction {
  if (!check) return "ask_client";
  if (check.group === "deliverable") return check.status === "fail" ? "regenerate_shot" : "targeted_edit";
  if (check.group === "text" || check.group === "brand") return "targeted_edit";
  if (check.group === "perceptual") {
    // A distorted face/hand needs a fresh shot; continuity/motion/audio take an edit.
    if (/face|identity|hand/i.test(check.label) && check.status === "fail") return "regenerate_shot";
    return "targeted_edit";
  }
  if (check.group === "scenes") return "regenerate_shot"; // a missing/prohibited scene
  return "ask_client";
}

export function decideSelfRepair(report: QaReport, ctx: SelfRepairContext): SelfRepairDecision {
  const component = smallestFailure(report);
  let action = actionFor(component);
  const incrementalCostUsd = round(ctx.unitCostUsd * ctx.attempts);

  const withinSpendLimit =
    incrementalCostUsd <= ctx.maxAutoSpendPerRepairUsd &&
    incrementalCostUsd <= ctx.remainingJobBudgetUsd &&
    ctx.autoSpentThisJobUsd + incrementalCostUsd <= ctx.maxAutoSpendPerJobUsd;

  // Reasons the agent may NOT continue on its own, most serious first.
  let escalationReason: string | null = null;
  if (ctx.introducesNewConcern) escalationReason = `Fix would introduce a new ${ctx.introducesNewConcern} concern`;
  else if (!ctx.modelFamilyAllowed) escalationReason = "Repair model family is not in the allowed list";
  else if (incrementalCostUsd > ctx.maxAutoSpendPerRepairUsd) escalationReason = `Over the $${ctx.maxAutoSpendPerRepairUsd} per-repair limit`;
  else if (incrementalCostUsd > ctx.remainingJobBudgetUsd) escalationReason = "Over the remaining approved budget";
  else if (ctx.autoSpentThisJobUsd + incrementalCostUsd > ctx.maxAutoSpendPerJobUsd) escalationReason = `Over the $${ctx.maxAutoSpendPerJobUsd} per-job automatic-spend limit`;

  const canAutoAct = action !== "ask_client" && action !== "escalate";
  const auto = canAutoAct && withinSpendLimit && escalationReason === null;

  let recommendation: string;
  if (auto) {
    recommendation = `Auto: ${describe(action)} (${component?.label ?? "issue"}) for $${incrementalCostUsd.toFixed(2)}.`;
  } else if (action === "ask_client") {
    recommendation = "Ask the client a clarifying question — the fix depends on their intent.";
  } else {
    recommendation = `Recommend: ${describe(action)} (${component?.label ?? "issue"}), est. $${incrementalCostUsd.toFixed(2)}. ${escalationReason ?? "Needs your approval"}.`;
    action = "escalate";
  }

  return {
    recommendedAction: action,
    auto,
    smallestFailedComponent: component?.label ?? null,
    incrementalCostUsd,
    withinSpendLimit,
    recommendation,
    escalationReason: auto ? null : (escalationReason ?? (action === "escalate" ? "Needs human approval" : null)),
  };
}

function describe(action: RepairAction): string {
  switch (action) {
    case "targeted_edit":
      return "targeted edit of the one shot";
    case "regenerate_shot":
      return "regenerate the one failing shot";
    case "change_model":
      return "re-run on a different model";
    case "ask_client":
      return "ask the client";
    case "escalate":
      return "escalate";
  }
}
