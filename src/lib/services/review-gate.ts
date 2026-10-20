import type { Generation, Workflow, WorkflowStep } from "@/lib/domain/types";

/**
 * Steps are sequential and each feeds the next, so a finished step hands on only what the operator approved.
 * Returns the finished step whose takes still need a human decision before `next` may start, or null.
 */
export function stepAwaitingReview(wf: Workflow, gens: Generation[], next: WorkflowStep): WorkflowStep | null {
  const prev = wf.steps.filter((s) => s.order < next.order).sort((a, b) => b.order - a.order)[0];
  if (!prev || prev.status !== "done" || !prev.requiresReview) return null;
  const takes = gens.filter((g) => g.stepId === prev.id && !g.revisionId && g.status === "completed");
  if (!takes.length) return null;
  return takes.some((g) => g.reviewStatus === "approved") ? null : prev;
}
