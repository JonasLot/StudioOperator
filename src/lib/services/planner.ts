import type { BriefAnalysis, Workflow, WorkflowStep } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import { newId } from "./ids";

/**
 * Turns structured requirements into an ordered production plan on Higgsfield models.
 * Attempts are deliberately generous: generative work needs selects, and under-estimating
 * here is what silently destroys margin.
 */
export function buildWorkflow(analysis: BriefAnalysis, jobId: string, version: number, contingencyPct: number): Workflow {
  const workflowId = newId("wf");
  const steps: Omit<WorkflowStep, "order">[] = [];
  const d = analysis.deliverables;
  const video = d.filter((x) => x.kind === "film" || x.kind === "social" || x.kind === "cutdown");
  const hero = d.filter((x) => x.kind === "film" || x.kind === "social");
  const cutdowns = d.filter((x) => x.kind === "cutdown");
  const stills = d.filter((x) => x.kind === "still");
  const vo = d.find((x) => x.kind === "voiceover");
  const cinematic = d.some((x) => x.kind === "film") || /cinematic|film look|anamorphic|35mm/i.test(analysis.summary + analysis.brandConstraints.join(" "));
  const heroShots = Math.max(0, analysis.estimatedShots - cutdowns.reduce((a, c) => a + Math.ceil(((c.durationSec ?? 15) / 3.5) * 0.4) * c.quantity, 0));

  const add = (s: Omit<WorkflowStep, "id" | "workflowId" | "order" | "unitCost" | "estimatedTotalCost" | "status">) => {
    const model = getModel(s.modelId);
    steps.push({
      ...s,
      id: newId("st"),
      workflowId,
      unitCost: model.unitCostUsd,
      estimatedTotalCost: Math.round(model.unitCostUsd * s.estimatedAttempts * 100) / 100,
      status: "pending",
    });
  };

  const keyframesNeeded = Math.max(heroShots, 0) + stills.reduce((a, s) => a + s.quantity, 0);
  if (video.length || stills.length) {
    add({
      name: "Look development & keyframes",
      category: "image",
      modelId: "soul-image",
      purpose: "Lock the visual language — lighting, palette, framing — before any motion spend.",
      inputs: ["Brief requirements", ...analysis.references.slice(0, 3), ...analysis.brandConstraints.slice(0, 2)],
      expectedOutputs: [`${keyframesNeeded} approved keyframes (${hero[0]?.aspectRatio ?? stills[0]?.aspectRatio ?? analysis.dimensions[0] ?? "aspect TBC"})`],
      deliverableIds: [...hero, ...stills].map((x) => x.id),
      estimatedAttempts: Math.max(4, Math.ceil(keyframesNeeded * 3)),
    });
  }

  if (analysis.exactText.length) {
    add({
      name: "Typography & end frames",
      category: "image",
      modelId: "ideogram-4",
      purpose: "Render client copy verbatim — supers, taglines and end card.",
      inputs: analysis.exactText.map((t) => `“${t}”`),
      expectedOutputs: [`${analysis.exactText.length} text frame${analysis.exactText.length > 1 ? "s" : ""}, spell-checked against brief`],
      deliverableIds: video.map((x) => x.id),
      estimatedAttempts: analysis.exactText.length * 3,
    });
  }

  if (hero.length && heroShots > 0) {
    add({
      name: cinematic ? "Hero shots (cinematic)" : "Hero shots",
      category: "video",
      modelId: cinematic ? "cinema-studio" : "kling-o3-image-ref",
      purpose: "Animate approved keyframes into the hero sequence with deliberate camera moves.",
      inputs: ["Approved keyframes", "Shot list from brief"],
      expectedOutputs: [`${heroShots} selected shots @ ~4–5s`],
      deliverableIds: hero.map((x) => x.id),
      estimatedAttempts: Math.ceil(heroShots * 2.5),
    });
  }

  if (cutdowns.length) {
    const cutShots = cutdowns.reduce((a, c) => a + Math.ceil(((c.durationSec ?? 15) / 3.5) * 0.4) * c.quantity, 0);
    add({
      name: "Cutdown reframes & pickups",
      category: "video",
      modelId: "seedance-2-5-ref",
      purpose: "Vertical reframes and a few native pickup shots; most cutdown footage reuses hero selects.",
      inputs: ["Hero selects", `Target ${cutdowns[0].aspectRatio ?? "vertical"}`],
      expectedOutputs: [`${cutShots} pickup shots for ${cutdowns.map((c) => c.title).join(", ")}`],
      deliverableIds: cutdowns.map((x) => x.id),
      estimatedAttempts: Math.max(2, Math.ceil(cutShots * 2)),
    });
  }

  if (vo) {
    add({
      name: "Voiceover takes",
      category: "voice",
      modelId: "voice-tts",
      purpose: "Narration from the approved script with a stock synthetic voice.",
      inputs: ["Approved script", ...analysis.exactText.slice(0, 1).map((t) => `“${t}”`)],
      expectedOutputs: ["1 selected VO take, timed to picture"],
      deliverableIds: [vo.id],
      estimatedAttempts: 4,
    });
  }

  if (video.length) {
    const renders = video.reduce((a, v) => a + v.quantity, 0);
    add({
      name: "Edit & conform",
      category: "editing",
      modelId: "edit-assemble",
      purpose: "Assemble selects, titles and audio into each deliverable.",
      inputs: ["Selected shots", vo ? "VO take" : "Music bed", "Text frames"],
      expectedOutputs: [`${renders} edited render${renders > 1 ? "s" : ""}`],
      deliverableIds: video.map((x) => x.id),
      estimatedAttempts: renders * 2,
    });
    add({
      name: "Finishing & masters",
      category: "finishing",
      modelId: "upscale-4k",
      purpose: "Upscale, grade and export delivery masters.",
      inputs: ["Locked edits"],
      expectedOutputs: video.map((v) => `${v.quantity > 1 ? `${v.quantity}× ` : ""}${v.title} master (${v.resolution ?? "1080p"})`),
      deliverableIds: video.map((x) => x.id),
      estimatedAttempts: renders,
    });
  } else if (stills.length) {
    add({
      name: "Finishing & masters",
      category: "finishing",
      modelId: "upscale-4k",
      purpose: "Upscale and retouch final stills.",
      inputs: ["Selected stills"],
      expectedOutputs: stills.map((s) => `${s.quantity} finished stills`),
      deliverableIds: stills.map((x) => x.id),
      estimatedAttempts: stills.reduce((a, s) => a + s.quantity, 0),
    });
  }

  const ordered: WorkflowStep[] = steps.map((s, i) => ({ ...s, order: i + 1 }));
  const total = Math.round(ordered.reduce((a, s) => a + s.estimatedTotalCost, 0) * 100) / 100;
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
    steps: ordered,
  };
}
