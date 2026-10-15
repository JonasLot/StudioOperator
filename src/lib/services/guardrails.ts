import type { Generation, Job, Workflow } from "@/lib/domain/types";
import { generationSpend } from "./economics";

/**
 * Human-in-the-loop policy. Every rule here is enforced server-side; the UI only reflects it.
 *
 *  1. Nothing is generated until a human approves the initial workflow AND a maximum production budget.
 *  2. After approval the agent may run steps only while committed spend + next estimate <= approved cap.
 *  3. A budget increase, a material workflow change, an uncleared rights issue, or final delivery
 *     always stops for a human.
 *  4. Marketplace actions (see marketplace-policy.ts) are never automated.
 */

export class GuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardrailError";
  }
}

export function assertWorkflowApproved(job: Job, workflow: Workflow | null): asserts workflow is Workflow {
  if (!workflow) throw new GuardrailError("No production plan exists for this job.");
  if (workflow.approvalStatus !== "approved") {
    throw new GuardrailError("The workflow and maximum budget have not been approved by a human.");
  }
  if (!["approved", "generating", "qa"].includes(job.status)) {
    throw new GuardrailError(`Job is ${job.status}; production cannot run.`);
  }
}

export function assertRightsCleared(job: Job, rightsConcerns: string[]) {
  if (rightsConcerns.length > 0 && !job.rightsCleared) {
    throw new GuardrailError("Rights concerns are open. A human must clear them before the workflow can be approved.");
  }
}

export function committedSpend(generations: Generation[]) {
  return Math.round(generations.reduce((a, g) => a + generationSpend(g), 0) * 100) / 100;
}

export function fitsBudget(workflow: Workflow, generations: Generation[], nextEstimate: number) {
  return committedSpend(generations) + nextEstimate <= workflow.maxBudget + 1e-9;
}

export function assertMaxBudgetSane(maxBudget: number, estimate: number, clientPrice: number) {
  if (!Number.isFinite(maxBudget) || maxBudget <= 0) throw new GuardrailError("Maximum budget must be a positive amount.");
  if (maxBudget < estimate) {
    throw new GuardrailError(`Maximum budget ($${maxBudget}) is below the plan estimate ($${estimate.toFixed(2)}).`);
  }
  if (maxBudget > clientPrice) {
    throw new GuardrailError("Maximum generation budget cannot exceed the client price.");
  }
}
