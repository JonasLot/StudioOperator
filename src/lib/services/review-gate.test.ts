import { test } from "node:test";
import assert from "node:assert/strict";
import type { Generation, Workflow, WorkflowStep } from "@/lib/domain/types";
import { stepAwaitingReview } from "./review-gate";

const step = (order: number, status: WorkflowStep["status"]) => ({ id: `s${order}`, order, status, requiresReview: true }) as WorkflowStep;
const take = (stepId: string, reviewStatus: Generation["reviewStatus"], status: Generation["status"] = "completed") =>
  ({ stepId, reviewStatus, status, revisionId: null }) as Generation;
const wf = { steps: [step(1, "done"), step(2, "pending")] } as Workflow;

test("the next step waits while the finished step has no approved take", () => {
  assert.equal(stepAwaitingReview(wf, [take("s1", "pending")], wf.steps[1])?.id, "s1");
  assert.equal(stepAwaitingReview(wf, [take("s1", "rejected"), take("s1", "pending")], wf.steps[1])?.id, "s1");
});

test("an approved take releases the next step", () => {
  assert.equal(stepAwaitingReview(wf, [take("s1", "pending"), take("s1", "approved")], wf.steps[1]), null);
});

test("no gate for the first step or when nothing usable was produced", () => {
  assert.equal(stepAwaitingReview(wf, [], wf.steps[0]), null);
  assert.equal(stepAwaitingReview(wf, [take("s1", "pending", "failed")], wf.steps[1]), null);
});
