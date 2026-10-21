import type { BriefView, Generation, TakeReview, Workflow, WorkflowStep } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";

export interface StepHandoff {
  urls: string[];
  from: WorkflowStep | null;
  takeAttempt: number | null;
  takePrompt: string | null;
  outputType: "image" | "video" | "audio" | null;
  reviewStatus: TakeReview | null;
  note: string | null;
}

export interface ResolveHandoffOptions {
  publicBaseUrl?: string;
  mockMode?: boolean;
}

/**
 * Resolves what earlier steps handed on to `step`:
 * - Prioritizes approved takes over unreviewed picks
 * - Matches model capabilities (e.g. keyframes for image-to-video / image references, or video takes for editing/finishing)
 * - Resolves media URLs (handling relative /api/ URLs in both production and mock environments)
 */
export function resolveStepHandoff(
  wf: Workflow,
  gens: Generation[],
  step: WorkflowStep,
  opts?: ResolveHandoffOptions
): StepHandoff {
  let model;
  try {
    model = getModel(step.modelId);
  } catch {
    model = null;
  }
  const wantsImageOnly = model ? (model.id.includes("i2v") || model.id.includes("image-ref") || model.category === "image") : false;
  const prevSteps = wf.steps.filter((s) => s.order < step.order && s.status === "done").sort((a, b) => b.order - a.order);

  let targetStep: WorkflowStep | null = null;
  let chosenTakes: Generation[] = [];

  for (const prev of prevSteps) {
    const takes = gens.filter((g) => g.stepId === prev.id && !g.revisionId && g.status === "completed" && g.outputUrl);
    if (!takes.length) continue;

    if (wantsImageOnly) {
      const imgTakes = takes.filter((g) => g.outputType === "image");
      if (imgTakes.length) {
        targetStep = prev;
        const approved = imgTakes.filter((g) => g.reviewStatus === "approved");
        const selected = imgTakes.filter((g) => g.selected);
        chosenTakes = approved.length ? approved : (selected.length ? selected : imgTakes.slice(0, 1));
        break;
      }
    } else {
      targetStep = prev;
      const approved = takes.filter((g) => g.reviewStatus === "approved");
      const selected = takes.filter((g) => g.selected);
      chosenTakes = approved.length ? approved : (selected.length ? selected : takes.slice(0, 1));
      break;
    }
  }

  // Fallback if wantsImageOnly was requested but no earlier image takes exist
  if (!targetStep && prevSteps.length) {
    for (const prev of prevSteps) {
      const takes = gens.filter((g) => g.stepId === prev.id && !g.revisionId && g.status === "completed" && g.outputUrl);
      if (takes.length) {
        targetStep = prev;
        const approved = takes.filter((g) => g.reviewStatus === "approved");
        const selected = takes.filter((g) => g.selected);
        chosenTakes = approved.length ? approved : (selected.length ? selected : takes.slice(0, 1));
        break;
      }
    }
  }

  if (!targetStep || !chosenTakes.length) {
    return {
      urls: [],
      from: null,
      takeAttempt: null,
      takePrompt: null,
      outputType: null,
      reviewStatus: null,
      note: null,
    };
  }

  const base = opts?.publicBaseUrl || (opts?.mockMode ? "http://localhost:3000" : "");
  const urls: string[] = [];
  for (const g of chosenTakes) {
    const u = g.outputUrl!;
    if (/^https?:\/\//.test(u)) {
      urls.push(u);
    } else if (base && u.startsWith("/")) {
      urls.push(`${base}${u}`);
    } else if (opts?.mockMode && u.startsWith("/")) {
      urls.push(`http://localhost:3000${u}`);
    }
  }

  const lead = chosenTakes[0];
  const missingBase = !urls.length && !base && !opts?.mockMode;
  const note = missingBase
    ? "no public app URL is configured (set APP_URL), so the output could not be handed on"
    : null;

  return {
    urls,
    from: targetStep,
    takeAttempt: lead.attempt,
    takePrompt: lead.prompt,
    outputType: lead.outputType,
    reviewStatus: lead.reviewStatus,
    note,
  };
}

export interface BuildStepPromptInput {
  step: WorkflowStep;
  analysis: BriefView | null;
  attempt: number;
  creative: string;
  extra?: string;
  refInfo?: StepHandoff | null;
  rawBrief?: string;
}

/**
 * Builds the full prompt for a step generation:
 * - Injects the step's purpose and inputs
 * - Incorporates continuity and visual anchor from earlier approved takes
 * - Incorporates creative direction from the brief
 * - Appends brief requirements, formats, and brand constraints
 */
export function buildStepPrompt(input: BuildStepPromptInput): string {
  const { step, analysis, attempt, creative, extra, refInfo, rawBrief } = input;
  const parts: string[] = [];

  // 1. Step purpose / prompt
  if (step.purpose) parts.push(step.purpose);

  // 2. Explicit inputs defined on step
  if (step.inputs?.length) parts.push(`Inputs: ${step.inputs.join("; ")}`);

  // 3. Continuity & handoff from earlier steps
  if (refInfo?.from) {
    const approvedTag = refInfo.reviewStatus === "approved" ? "approved take" : `take ${refInfo.takeAttempt ?? 1}`;
    parts.push(`Continuity & handoff: building on Step ${refInfo.from.order} “${refInfo.from.name}” (${approvedTag}).`);
    if (refInfo.takePrompt) {
      parts.push(`Prior visual anchor: ${refInfo.takePrompt.split("\n")[0]}`);
    } else if (refInfo.from.purpose) {
      parts.push(`Prior step goal: ${refInfo.from.purpose}`);
    }
  }

  // 4. Creative direction (from locked or drafted brief)
  if (creative) parts.push(creative);

  // 5. Brief summary and must-haves
  if (analysis?.summary) {
    parts.push(`Brief: ${analysis.summary}`);
  } else if (rawBrief) {
    parts.push(`Brief: ${rawBrief.slice(0, 300)}`);
  }
  if (analysis?.references?.length) {
    parts.push(`Reference cues: ${analysis.references.join("; ")}`);
  }
  if (analysis?.dimensions?.length) {
    parts.push(`Format: ${analysis.dimensions.join(", ")}`);
  }
  if (analysis?.brandConstraints?.length) {
    parts.push(`Constraints: ${analysis.brandConstraints.slice(0, 3).join("; ")}`);
  }

  // 6. Text rendering constraint
  if (step.category === "image" && analysis?.exactText?.length && step.modelId === "ideogram-4") {
    parts.push(`Render text exactly: ${analysis.exactText.map((t) => `"${t}"`).join(" / ")}`);
  }

  // 7. Extra instructions (e.g. revision note or retry)
  if (extra) parts.push(extra);

  // 8. Attempt marker
  parts.push(`Take ${attempt}.`);

  return parts.filter(Boolean).join("\n");
}
