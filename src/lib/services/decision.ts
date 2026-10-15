import type { Decision, Job, Workflow } from "@/lib/domain/types";
import type { AnalysisDraft } from "@/lib/ai/brief-analyzer";
import { daysUntil } from "@/lib/utils";

export interface DecisionThresholds {
  minGrossMarginPct: number;
  rejectBelowMarginPct: number;
}

/**
 * Final accept / review / reject. The model's suggestion is one input; economics, deadline and
 * rights are enforced deterministically so the decision is explainable and can't be talked around.
 */
export function decide(job: Job, draft: AnalysisDraft, workflow: Workflow, t: DecisionThresholds): { decision: Decision; rationale: string[] } {
  const rationale = [...draft.rationale];
  let decision: Decision = draft.suggestedDecision;
  const escalate = (to: Decision) => {
    const rank = { accept: 0, review: 1, reject: 2 } as const;
    if (rank[to] > rank[decision]) decision = to;
  };

  if (draft.hardStop) escalate("reject");

  const net = job.budget * (1 - job.sourceFeePct);
  const spend = workflow.estimatedTotalCost * (1 + job.contingencyPct);
  const marginPct = job.budget > 0 ? (net - spend) / job.budget : -1;
  const pctTxt = `${Math.round(marginPct * 100)}%`;
  if (marginPct < t.rejectBelowMarginPct) {
    escalate("reject");
    rationale.push(`Expected gross margin ${pctTxt} is below the ${Math.round(t.rejectBelowMarginPct * 100)}% floor.`);
  } else if (marginPct < t.minGrossMarginPct) {
    escalate("review");
    rationale.push(`Expected gross margin ${pctTxt} is under the ${Math.round(t.minGrossMarginPct * 100)}% target — reprice or trim scope.`);
  } else {
    rationale.push(`Expected gross margin ${pctTxt} clears the ${Math.round(t.minGrossMarginPct * 100)}% target.`);
  }

  const days = daysUntil(job.deadline);
  const attempts = workflow.steps.reduce((a, s) => a + s.estimatedAttempts, 0);
  // ~60 generation attempts reviewed per working day, plus one day for client feedback.
  const neededDays = Math.ceil(attempts / 60) + 1;
  if (days < 1) {
    escalate("reject");
    rationale.push("Deadline has already passed.");
  } else if (days < neededDays) {
    escalate("review");
    rationale.push(`Deadline in ${days} day${days === 1 ? "" : "s"}; plan needs about ${neededDays} (${attempts} attempts incl. review).`);
  } else {
    rationale.push(`Timeline fits: ${days} days available, ~${neededDays} needed.`);
  }

  if (draft.rightsConcerns.length && decision === "accept") {
    escalate("review");
  }
  if (draft.confidence < 0.55) {
    escalate("review");
    rationale.push(`Analysis confidence is low (${Math.round(draft.confidence * 100)}%).`);
  }
  return { decision, rationale: [...new Set(rationale)] };
}
