import { MODEL_CATALOG, type CatalogModel } from "../higgsfield/catalog";
import type { Capability } from "./schema";

// ---------------------------------------------------------------------------
// Capability -> catalog model.
//
// The model only ever names a *capability*. The application is the single place
// that decides which catalogued model (and therefore which price) fulfils it.
// This keeps pricing deterministic and out of the model's hands.
// ---------------------------------------------------------------------------

export const CAPABILITY_TO_MODEL: Record<Capability, string> = {
  image_keyframes: "soul-image",
  text_frames: "ideogram-4",
  hero_video: "cinema-studio",
  reference_video: "kling-o3-image-ref",
  cutdown_video: "seedance-2-5-ref",
  voiceover: "voice-tts",
  edit_assemble: "edit-assemble",
  finishing: "upscale-4k",
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  image_keyframes: "Image keyframes / look dev",
  text_frames: "On-screen text & end frames",
  hero_video: "Hero video (cinematic)",
  reference_video: "Reference-driven video",
  cutdown_video: "Social cutdown video",
  voiceover: "Voiceover",
  edit_assemble: "Edit & assemble",
  finishing: "Finishing (upscale & grade)",
};

/** The catalog model that fulfils a capability, or null when none is catalogued/priced. */
export function resolveCapability(capability: Capability): CatalogModel | null {
  const id = CAPABILITY_TO_MODEL[capability];
  if (!id) return null;
  const model = MODEL_CATALOG.find((m) => m.id === id);
  if (!model) return null;
  // A model with no usable unit price is treated as unpriced (routes to review, never a guess).
  if (!(typeof model.unitCostUsd === "number" && model.unitCostUsd > 0)) return null;
  return model;
}
