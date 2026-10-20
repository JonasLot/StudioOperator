import type { Deliverable, ModelCategory, Workflow, WorkflowStep } from "../domain/types";
import { getModel } from "../higgsfield/catalog";
import { newId } from "../services/ids";
import type { CostPlan, PlannedStep } from "./cost";
import type { BriefFacts } from "./view";
import type { Capability } from "./schema";

// ---------------------------------------------------------------------------
// Production plan = the priced plan.
//
// The workflow a human approves is built directly from the cost plan the
// decision layer already priced: same steps, same catalog models, same
// (clamped) attempts. There is no second, separately-estimated plan to drift
// from the numbers the accept / review / reject call was made on.
// Pure module: all inputs are passed in.
// ---------------------------------------------------------------------------

type StepBody = Pick<WorkflowStep, "inputs" | "expectedOutputs" | "deliverableIds">;

const isVideo = (d: Deliverable) => d.kind === "film" || d.kind === "social" || d.kind === "cutdown";
const ids = (ds: Deliverable[]) => ds.map((d) => d.id);

/** Deliverables a capability serves; falls back to everything that isn't audio-only. */
function servedBy(capability: Capability, ds: Deliverable[]): Deliverable[] {
  const visual = ds.filter((d) => d.kind !== "voiceover");
  const video = ds.filter(isVideo);
  const pick = (xs: Deliverable[]) => (xs.length ? xs : visual);
  switch (capability) {
    case "image_keyframes":
      return visual;
    case "text_frames":
    case "reference_video":
    case "edit_assemble":
      return pick(video);
    case "hero_video":
      return pick(ds.filter((d) => d.kind === "film" || d.kind === "social"));
    case "cutdown_video":
      return pick(ds.filter((d) => d.kind === "cutdown"));
    case "voiceover":
      return ds.filter((d) => d.kind === "voiceover");
    case "finishing":
      return pick(video.length ? video : ds.filter((d) => d.kind === "still"));
  }
}

const quoted = (xs: string[]) => xs.map((t) => `“${t}”`);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function bodyFor(step: PlannedStep, facts: BriefFacts): StepBody {
  const served = servedBy(step.capability, facts.deliverables);
  const deliverableIds = ids(served);
  const titles = served.map((d) => d.title);
  const aspect = served.find((d) => d.aspectRatio)?.aspectRatio ?? facts.dimensions[0] ?? "aspect TBC";
  const constraints = facts.brandConstraints.slice(0, 2);

  switch (step.capability) {
    case "image_keyframes":
      return {
        deliverableIds,
        inputs: ["Brief requirements", ...facts.references.slice(0, 3), ...constraints],
        expectedOutputs: [`Approved keyframes (${aspect})`],
      };
    case "text_frames":
      return {
        deliverableIds,
        inputs: facts.exactText.length ? quoted(facts.exactText) : ["Client copy from the brief"],
        expectedOutputs: [`${plural(facts.exactText.length, "text frame")}, spell-checked against the brief`],
      };
    case "hero_video":
    case "reference_video":
      return {
        deliverableIds,
        inputs: ["Approved keyframes", "Shot list from brief"],
        expectedOutputs: [`Selected shots for ${titles.join(", ") || "the film"}`],
      };
    case "cutdown_video":
      return {
        deliverableIds,
        inputs: ["Hero selects", `Target ${aspect}`],
        expectedOutputs: [`Reframes and pickup shots for ${titles.join(", ") || "the cutdowns"}`],
      };
    case "voiceover":
      return {
        deliverableIds,
        inputs: ["Approved script", ...quoted(facts.exactText.slice(0, 1))],
        expectedOutputs: ["Selected VO take, timed to picture"],
      };
    case "edit_assemble": {
      const renders = served.reduce((a, d) => a + d.quantity, 0) || 1;
      return {
        deliverableIds,
        inputs: ["Selected shots", facts.deliverables.some((d) => d.kind === "voiceover") ? "VO take" : "Music bed", "Text frames"],
        expectedOutputs: [`${plural(renders, "edited render")}`],
      };
    }
    case "finishing":
      return {
        deliverableIds,
        inputs: ["Locked edits"],
        expectedOutputs: served.map((d) => `${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.title} master (${d.resolution ?? "1080p"})`),
      };
  }
}

export function buildWorkflow(
  plan: CostPlan,
  facts: BriefFacts,
  jobId: string,
  version: number,
  contingencyPct: number,
): Workflow {
  const workflowId = newId("wf");
  const steps: WorkflowStep[] = plan.steps.map((s, i) => {
    const model = getModel(s.modelId);
    return {
      id: newId("st"),
      workflowId,
      order: i + 1,
      name: s.label,
      category: model.category as ModelCategory,
      modelId: model.id,
      purpose: s.description,
      ...bodyFor(s, facts),
      estimatedAttempts: s.estimatedAttempts,
      unitCost: s.unitCostUsd,
      estimatedTotalCost: s.stepCost,
      status: "pending",
      requiresReview: true,
    };
  });
  const total = Math.round(steps.reduce((a, s) => a + s.estimatedTotalCost, 0) * 100) / 100;
  return {
    id: workflowId,
    jobId,
    version,
    approvalStatus: "draft",
    maxBudget: Math.ceil(total * (1 + contingencyPct)),
    estimatedTotalCost: total,
    approvedAt: null,
    approvedBy: null,
    notes: null,
    createdAt: new Date().toISOString(),
    steps,
  };
}
