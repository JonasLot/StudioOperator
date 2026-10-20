// ===========================================================================
// Productized service templates. A template is what makes autonomy possible:
// it fixes the inputs, the model recipe, the quality bar, the included
// revisions, the delivery package and — crucially — the target margin,
// maximum production spend and the conditions that must always pause for a
// human. Pure data + helpers (no server-only, no runtime "@/..." imports), so
// it is unit-testable and safe to import from the client.
// ===========================================================================

import type { ModelCategory } from "@/lib/domain/types";

export interface TemplateInput {
  key: string;
  label: string;
  accepts: string[]; // accepted file types / formats
  required: boolean;
  note?: string;
}

export interface RecipeStep {
  category: ModelCategory;
  modelId: string;
  label: string;
  attempts: number;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  summary: string;
  deliverablesSummary: string;
  defaultTurnaroundHours: number;
  requiredInputs: TemplateInput[];
  acceptedFileTypes: string[];
  modelRecipe: RecipeStep[];
  qualityChecklist: string[];
  includedRevisions: number;
  deliveryPackage: string[];
  targetGrossMarginPct: number;
  maxProductionSpendUsd: number;
  escalationConditions: string[];
}

const IMG = ["png", "jpg", "jpeg", "webp"];
const DOC = ["pdf", "docx", "txt"];
const VID = ["mp4", "mov"];

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: "launch-video",
    name: "Launch Video",
    summary: "One short hero launch film, delivered in two aspect ratios with a set of approved stills.",
    deliverablesSummary: "1× 15s video (two aspect ratios) + 3 stills · 2 revision rounds · 72h",
    defaultTurnaroundHours: 72,
    requiredInputs: [
      { key: "product", label: "Product image or reference", accepts: IMG, required: true },
      { key: "logo", label: "Logo (vector or transparent PNG)", accepts: ["svg", ...IMG], required: true },
      { key: "brand_guide", label: "Brand guide (colours, fonts, tone)", accepts: DOC, required: false },
      { key: "copy", label: "Exact on-screen copy / end-card text", accepts: DOC, required: false, note: "verbatim" },
      { key: "likes", label: "Examples the client likes", accepts: [...IMG, ...VID], required: false },
      { key: "dislikes", label: "Examples the client dislikes", accepts: [...IMG, ...VID], required: false },
    ],
    acceptedFileTypes: [...new Set([...IMG, "svg", ...DOC, ...VID])],
    modelRecipe: [
      { category: "image", modelId: "soul-image", label: "Concept & approved keyframes", attempts: 8 },
      { category: "video", modelId: "kling-o3-image-ref", label: "Hero motion from keyframes", attempts: 6 },
      { category: "editing", modelId: "edit-assemble", label: "Edit, titles, two aspect ratios", attempts: 2 },
      { category: "finishing", modelId: "upscale-4k", label: "Grade & masters", attempts: 2 },
    ],
    qualityChecklist: [
      "Both aspect ratios delivered (9:16 and 16:9)",
      "Product and logo on-model and legible",
      "On-screen copy rendered verbatim and spell-checked",
      "No prohibited elements; brand palette respected",
      "Motion and continuity clean across shots",
    ],
    includedRevisions: 2,
    deliveryPackage: ["video_9x16.mp4", "video_16x9.mp4", "still_01.png", "still_02.png", "still_03.png", "usage-notes.txt"],
    targetGrossMarginPct: 0.6,
    maxProductionSpendUsd: 80,
    escalationConditions: [
      "Any real-person likeness or voice",
      "Unclear ownership of a supplied asset",
      "Factual product/advertising claims to verify",
      "Exact packaging or regulated copy",
    ],
  },
  {
    id: "ugc-ad-pack",
    name: "UGC Ad Pack",
    summary: "A testable set of hooks over one body, finished as several captioned variations for paid social.",
    deliverablesSummary: "3 hooks + 1 body → 3 final variations + captions · 1 revision round",
    defaultTurnaroundHours: 96,
    requiredInputs: [
      { key: "product", label: "Product image(s)", accepts: IMG, required: true },
      { key: "offer", label: "Offer / core message", accepts: DOC, required: true },
      { key: "brand_guide", label: "Brand guide or tone note", accepts: DOC, required: false },
      { key: "hooks", label: "Hook ideas the client likes (optional)", accepts: DOC, required: false },
      { key: "dislikes", label: "Styles the client dislikes", accepts: [...IMG, ...VID], required: false },
    ],
    acceptedFileTypes: [...new Set([...IMG, ...DOC, ...VID])],
    modelRecipe: [
      { category: "image", modelId: "soul-image", label: "Hook keyframes", attempts: 9 },
      { category: "video", modelId: "seedance-2-5-ref", label: "Hook + body footage", attempts: 8 },
      { category: "editing", modelId: "edit-assemble", label: "Assemble 3 variations + captions", attempts: 3 },
      { category: "finishing", modelId: "upscale-4k", label: "Finish & export", attempts: 1 },
    ],
    qualityChecklist: [
      "Three distinct hooks on one coherent body",
      "Captions accurate and on-brand",
      "Each variation self-contained and platform-safe",
      "No unverifiable claims in copy",
    ],
    includedRevisions: 1,
    deliveryPackage: ["variation_01.mp4", "variation_02.mp4", "variation_03.mp4", "captions.srt", "usage-notes.txt"],
    targetGrossMarginPct: 0.65,
    maxProductionSpendUsd: 55,
    escalationConditions: [
      "Any performance or factual claim in copy",
      "Real-person likeness or testimonial",
      "Unclear ownership of a supplied asset",
    ],
  },
  {
    id: "localization-pack",
    name: "Localization Pack",
    summary: "One approved source ad adapted into five languages — graphics, voice, captions and lip sync.",
    deliverablesSummary: "1 source ad → 5 languages (graphics, voice, captions, lip sync)",
    defaultTurnaroundHours: 120,
    requiredInputs: [
      { key: "source_ad", label: "Approved source ad (locked master)", accepts: VID, required: true },
      { key: "translations", label: "Approved translations per language", accepts: DOC, required: true, note: "client-approved copy" },
      { key: "pronunciation", label: "Pronunciation notes (brand & product names)", accepts: DOC, required: true },
      { key: "voice_consent", label: "Voice/likeness consent if a real voice is cloned", accepts: DOC, required: false, note: "always pauses for a human" },
      { key: "brand_guide", label: "Localized brand assets (fonts for each script)", accepts: DOC, required: false },
    ],
    acceptedFileTypes: [...new Set([...VID, ...DOC, ...IMG])],
    modelRecipe: [
      { category: "image", modelId: "ideogram-4", label: "Translated on-screen graphics (5 languages)", attempts: 10 },
      { category: "voice", modelId: "voice-tts", label: "Localized voice tracks", attempts: 6 },
      { category: "editing", modelId: "edit-assemble", label: "Conform, captions & lip sync per language", attempts: 5 },
      { category: "finishing", modelId: "upscale-4k", label: "Export 5 masters", attempts: 5 },
    ],
    qualityChecklist: [
      "Each language uses client-approved translated copy verbatim",
      "Brand & product names pronounced per the pronunciation guide",
      "Captions match the voice track in every language",
      "Lip sync within a few frames across all five",
      "Script-correct fonts; no clipped or reflowed text",
    ],
    includedRevisions: 1,
    deliveryPackage: ["master_en.mp4", "master_es.mp4", "master_de.mp4", "master_fr.mp4", "master_pt.mp4", "captions/*.srt", "usage-notes.txt"],
    targetGrossMarginPct: 0.55,
    maxProductionSpendUsd: 70,
    escalationConditions: [
      "Any cloned voice or real-person likeness (consent required)",
      "Regulated or legal copy in any locale",
      "Translation ownership or accuracy unconfirmed",
    ],
  },
];

export function getTemplate(id: string | null | undefined): ServiceTemplate | null {
  if (!id) return null;
  return SERVICE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Lightweight keyword match from a brief/title to a template (for suggesting one on intake). */
export function matchTemplate(text: string): ServiceTemplate | null {
  const t = text.toLowerCase();
  if (/\b(localiz|localis|five languages|5 languages|translat|dub|lip ?sync|multi-?language)\b/.test(t)) return getTemplate("localization-pack");
  if (/\b(ugc|hook|hooks|ad pack|variations?|user-generated|paid social|tiktok ad)\b/.test(t)) return getTemplate("ugc-ad-pack");
  if (/\b(launch|hero (film|video)|brand film|cinematic|short film|15 ?s|15-second|aspect ratios?)\b/.test(t)) return getTemplate("launch-video");
  return null;
}
