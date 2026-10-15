// ===========================================================================
// Configurable capability catalog for the transparent model router.
//
// Models are grouped by PRODUCTION ROLE (search / control / ship / finish).
// This is the single, editable source the router reasons over — change entries,
// costs or roles here and the router and its economics follow.
//
// ⚠️ UNVERIFIED: the model families, capabilities and per-attempt costs below are
// SEEDED from routing principles, not confirmed against the live Higgsfield
// catalog or its documented model pages (the docs host is unreachable from this
// environment). Each entry carries `verified: false` until checked; the UI shows
// that state so nothing here is presented as established fact. Where an entry maps
// to a runnable provider model it sets `providerModelId` (see higgsfield/catalog.ts).
//
// Pure module (no server-only, no "@/..." value imports) so the router logic,
// the client UI, and tests can all import it directly.
// ===========================================================================

export const ROUTER_ROLES = ["search", "control", "ship", "finish"] as const;
export type RouterRole = (typeof ROUTER_ROLES)[number];

export const ROLE_META: Record<RouterRole, { label: string; blurb: string }> = {
  search: { label: "SEARCH", blurb: "Cheap/fast enough to generate many hooks, compositions and rough concepts." },
  control: { label: "CONTROL", blurb: "Preserves a product, face, character, motion, layout, logo, label or exact text." },
  ship: { label: "SHIP", blurb: "Premium models for the final client-facing asset, after the concept is chosen." },
  finish: { label: "FINISH", blurb: "Upscale, denoise, lip sync, voice, captions, localization and export." },
};

export type RouterMedium = "image" | "image_edit" | "video" | "audio_video" | "voice" | "upscale" | "lipsync" | "captions";
export type SpeedTier = "fast" | "standard" | "premium";

export interface RouterModel {
  id: string;
  label: string;
  family: string;
  role: RouterRole;
  medium: RouterMedium;
  strengths: string;
  failureMode: string; // the known way this model tends to fail
  costPerAttemptUsd: number;
  unitLabel: string;
  speed: SpeedTier;
  typicalQueue: string;
  controls: Partial<Record<"identity" | "text" | "layout" | "reference" | "motion" | "audio", boolean>>;
  maxResolution?: string;
  maxDurationSec?: number;
  providerModelId?: string; // links to higgsfield/catalog.ts when runnable
  verified: boolean;
  note?: string;
}

// prettier-ignore
export const ROUTER_CATALOG: RouterModel[] = [
  // --- SEARCH -------------------------------------------------------------
  { id: "flux-fast", label: "Flux (fast)", family: "Flux", role: "search", medium: "image", strengths: "Cheap, fast idea generation and compositions", failureMode: "Weak at exact text and tight brand control", costPerAttemptUsd: 0.03, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: { reference: true }, verified: false },
  { id: "seedream-concept", label: "Seedream (concept)", family: "Seedream", role: "search", medium: "image", strengths: "Fast product/lifestyle concepts with decent reference control", failureMode: "Drifts from precise product geometry at low attempts", costPerAttemptUsd: 0.04, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: { reference: true }, verified: false },
  { id: "wan-fast", label: "Wan (fast)", family: "Wan", role: "search", medium: "video", strengths: "Low-cost fast video concept tests", failureMode: "Temporal flicker; not final quality", costPerAttemptUsd: 0.25, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true }, maxDurationSec: 5, verified: false },
  { id: "ltx-fast", label: "LTX (fast)", family: "LTX", role: "search", medium: "video", strengths: "Very fast rough motion exploration", failureMode: "Low fidelity; artifacts on fine detail", costPerAttemptUsd: 0.2, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–2 min", controls: { motion: true }, maxDurationSec: 5, verified: false },
  { id: "seedance-fast", label: "Seedance Fast", family: "Seedance", role: "search", medium: "video", strengths: "Fast cutdown-style concept footage from references", failureMode: "Shot-to-shot consistency weaker than premium lane", costPerAttemptUsd: 0.3, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true }, maxDurationSec: 5, providerModelId: "seedance-2-5-ref", verified: false },
  { id: "pixverse-fast", label: "PixVerse (fast)", family: "PixVerse", role: "search", medium: "video", strengths: "Fast stylised social motion tests", failureMode: "Stylisation can override brand look", costPerAttemptUsd: 0.22, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true }, maxDurationSec: 5, verified: false },

  // --- CONTROL ------------------------------------------------------------
  { id: "qwen-edit", label: "Qwen Image/Edit", family: "Qwen", role: "control", medium: "image_edit", strengths: "Precise image edits, packaging and text correction", failureMode: "Can over-smooth edited regions", costPerAttemptUsd: 0.08, unitLabel: "per edit", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true, reference: true }, verified: false },
  { id: "soul-keyframe", label: "Soul (keyframes)", family: "Soul", role: "control", medium: "image", strengths: "Fashion, people and editorial taste; identity-consistent keyframes", failureMode: "Hands/edges need selects", costPerAttemptUsd: 0.06, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, providerModelId: "soul-image", verified: false },
  { id: "ideogram-text", label: "Ideogram (typography)", family: "Ideogram", role: "control", medium: "image", strengths: "Exact on-screen text, posters, end cards", failureMode: "Photoreal scenes weaker than dedicated image lanes", costPerAttemptUsd: 0.08, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true }, providerModelId: "ideogram-4", verified: false },
  { id: "recraft-design", label: "Recraft (design)", family: "Recraft", role: "control", medium: "image", strengths: "Designed promotional assets, vector-style, posters", failureMode: "Less photoreal; stylised output", costPerAttemptUsd: 0.07, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true }, verified: false },
  { id: "marketing-studio-image", label: "Marketing Studio Image", family: "Marketing Studio", role: "control", medium: "image", strengths: "Product/lifestyle variants with strong reference control", failureMode: "Needs clean reference assets to lock geometry", costPerAttemptUsd: 0.09, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { reference: true, identity: true }, verified: false },

  // --- SHIP ---------------------------------------------------------------
  { id: "kling-ship", label: "Kling O3 (image ref)", family: "Kling", role: "ship", medium: "video", strengths: "Cinematic camera and controlled motion from approved keyframes", failureMode: "Occasional morphing on fast motion", costPerAttemptUsd: 1.2, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "3–8 min", controls: { motion: true, reference: true, identity: true }, maxDurationSec: 5, providerModelId: "kling-o3-image-ref", verified: true, note: "The one endpoint confirmed against docs in higgsfield/catalog.ts." },
  { id: "veo-ship", label: "Veo (premium)", family: "Veo", role: "ship", medium: "video", strengths: "Premium cinematic motion and physics", failureMode: "Highest cost and longest queue", costPerAttemptUsd: 2.5, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "5–12 min", controls: { motion: true }, maxDurationSec: 8, verified: false },
  { id: "cinema-studio", label: "Cinema Studio", family: "Higgsfield", role: "ship", medium: "video", strengths: "Cinematic lensing and lighting for hero shots", failureMode: "Expensive; overkill for social cutdowns", costPerAttemptUsd: 2.4, unitLabel: "per 5s shot", speed: "premium", typicalQueue: "4–10 min", controls: { motion: true }, providerModelId: "cinema-studio", verified: false },
  { id: "seedance-ship", label: "Seedance (premium)", family: "Seedance", role: "ship", medium: "video", strengths: "Strong reference-driven premium motion", failureMode: "Physics less reliable than top cinematic lane", costPerAttemptUsd: 1.5, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "3–8 min", controls: { motion: true, reference: true }, verified: false },
  { id: "soul-ship", label: "Soul (final stills)", family: "Soul", role: "ship", medium: "image", strengths: "Final client-facing stills with editorial polish", failureMode: "Needs retouch pass for hero use", costPerAttemptUsd: 0.12, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, providerModelId: "soul-image", verified: false },
  { id: "minimax-talking", label: "MiniMax (talking)", family: "MiniMax", role: "ship", medium: "audio_video", strengths: "Talking / native-audio scenes", failureMode: "Lip timing needs a finishing pass", costPerAttemptUsd: 1.0, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "3–8 min", controls: { motion: true, audio: true }, maxDurationSec: 6, verified: false },

  // --- FINISH -------------------------------------------------------------
  { id: "topaz-upscale", label: "Topaz (upscale)", family: "Topaz", role: "finish", medium: "upscale", strengths: "High-quality upscale and denoise for delivery masters", failureMode: "Can over-sharpen; needs a human eye", costPerAttemptUsd: 0.5, unitLabel: "per master", speed: "standard", typicalQueue: "1–3 min", controls: {}, providerModelId: "upscale-4k", verified: false },
  { id: "bytedance-upscale", label: "ByteDance upscale", family: "ByteDance", role: "finish", medium: "upscale", strengths: "Fast, cheaper upscale for social masters", failureMode: "Less detail recovery than premium upscalers", costPerAttemptUsd: 0.4, unitLabel: "per master", speed: "fast", typicalQueue: "1–2 min", controls: {}, verified: false },
  { id: "lipsync-finish", label: "Lip sync", family: "LipSync", role: "finish", medium: "lipsync", strengths: "Aligns mouth to the approved VO/track", failureMode: "Struggles with extreme head angles", costPerAttemptUsd: 0.6, unitLabel: "per clip", speed: "standard", typicalQueue: "1–3 min", controls: { audio: true }, verified: false },
  { id: "voice-tts", label: "Voice (TTS)", family: "Voice", role: "finish", medium: "voice", strengths: "Narration / voiceover takes", failureMode: "Prosody needs direction on long reads", costPerAttemptUsd: 0.3, unitLabel: "per VO take", speed: "standard", typicalQueue: "seconds", controls: { audio: true }, providerModelId: "voice-tts", verified: false },
  { id: "captions-finish", label: "Captions / localize", family: "Captions", role: "finish", medium: "captions", strengths: "Burned-in captions and localized text", failureMode: "Line breaks need review per language", costPerAttemptUsd: 0.1, unitLabel: "per render", speed: "fast", typicalQueue: "seconds", controls: { text: true }, verified: false },
];

export function routerModel(id: string): RouterModel | null {
  return ROUTER_CATALOG.find((m) => m.id === id) ?? null;
}

export function byRole(role: RouterRole): RouterModel[] {
  return ROUTER_CATALOG.filter((m) => m.role === role);
}
