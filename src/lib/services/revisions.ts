import type { BriefView, RevisionAction } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";

export interface RevisionPlan {
  affectedDeliverable: string | null;
  recommendedAction: RevisionAction;
  actionSummary: string;
  modelId: string | null;
  attempts: number;
  expectedIncrementalCost: number;
  materialChange: boolean;
}

const RULES: { re: RegExp; action: RevisionAction; model: string | null; attempts: number; summary: string; material?: boolean }[] = [
  { re: /\b(add (?:a|another|an extra)|new (?:version|deliverable|format|cut|language)|extra (?:version|cut|spot)|also need|additional (?:spot|film|cut|version))\b/i, action: "new_deliverable", model: null, attempts: 0, summary: "New deliverable outside the approved scope — re-plan and re-quote.", material: true },
  { re: /\b(typo|spelling|text|copy|tagline|super|end ?card|logo)\b/i, action: "fix_text", model: "ideogram-4", attempts: 3, summary: "Re-render affected text frame verbatim, then re-conform the edit." },
  { re: /\b(voice|vo|narrat\w*|read|accent|pronounc\w*)\b/i, action: "rerecord_voice", model: "voice-tts", attempts: 3, summary: "Record new VO takes against the same script and re-mix." },
  { re: /\b(colou?r|grade|warmer|cooler|brighter|darker|contrast|grain|saturation)\b/i, action: "regrade", model: "upscale-4k", attempts: 2, summary: "Adjust grade on the locked edit and re-export masters." },
  { re: /\b(pacing|faster|slower|shorter|longer|cut|order|music|timing|transition)\b/i, action: "re_edit", model: "edit-assemble", attempts: 2, summary: "Re-cut with existing selects; no new generation needed." },
  { re: /\b(shot|scene|replace|camera|angle|character|face|hands?|product|background|wardrobe|look)\b/i, action: "regenerate_shot", model: "kling-o3-image-ref", attempts: 4, summary: "Regenerate the affected shot from an adjusted keyframe and drop it into the edit." },
];

export function planRevision(note: string, analysis: BriefView | null, deliverableHint: string | null): RevisionPlan {
  const rule = RULES.find((r) => r.re.test(note));
  const deliverable =
    deliverableHint ||
    analysis?.deliverables.find((d) => note.toLowerCase().includes(d.title.toLowerCase().split(" ")[0]))?.id ||
    analysis?.deliverables[0]?.id ||
    null;
  if (!rule) {
    return {
      affectedDeliverable: deliverable,
      recommendedAction: "clarify",
      actionSummary: "Note is ambiguous — ask the client which shot or frame they mean before spending.",
      modelId: null,
      attempts: 0,
      expectedIncrementalCost: 0,
      materialChange: false,
    };
  }
  const cost = rule.model ? Math.round(getModel(rule.model).unitCostUsd * rule.attempts * 100) / 100 : 0;
  // Any targeted fix on a video deliverable also needs a re-conform render.
  const conform = rule.action !== "re_edit" && rule.action !== "new_deliverable" && rule.action !== "regrade" ? getModel("edit-assemble").unitCostUsd : 0;
  return {
    affectedDeliverable: deliverable,
    recommendedAction: rule.action,
    actionSummary: rule.summary,
    modelId: rule.model,
    attempts: rule.attempts,
    expectedIncrementalCost: Math.round((cost + conform) * 100) / 100,
    materialChange: !!rule.material,
  };
}
