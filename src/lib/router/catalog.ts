// ===========================================================================
// Configurable capability catalog for the transparent model router.
//
// Models are grouped by PRODUCTION ROLE (search / control / ship / finish).
// This is the single, editable source the router reasons over — change entries,
// costs or roles here and the router and its economics follow.
//
// The entries are the models in Higgsfield's live model list (`higgsfield model
// list`): `jobType` is that list's id (e.g. "kling3_0"), and limits such as
// resolution, duration and reference counts come from each model's documented
// parameters. `listed: true` means the model was in that list; nothing here is
// invented. What is NOT from Higgsfield:
//   - `costPerAttemptUsd` — Higgsfield bills in credits and the list has no prices,
//     so these are planning estimates by tier. Replace them with real per-credit
//     prices.
//   - the role, `strengths` and `failureMode` text — editorial routing judgement.
//   - `params` — the non-default settings a lane implies (e.g. mode "fast").
// `providerModelId` links a model to a runnable entry in higgsfield/catalog.ts;
// only Soul V2, Kling 3.0 and Seedance 2.0 are linked so far, so the router can plan with them before the
// production pipeline can run them.
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
  finish: { label: "FINISH", blurb: "Upscale and voice — the last steps before QA and export." },
};

export type RouterMedium = "image" | "image_edit" | "video" | "audio_video" | "voice" | "upscale" | "upscale_image";
export type SpeedTier = "fast" | "standard" | "premium";

export interface RouterModel {
  id: string;
  label: string;
  family: string;
  role: RouterRole;
  medium: RouterMedium;
  strengths: string;
  failureMode: string; // the known way this model tends to fail
  costPerAttemptUsd: number; // planning estimate, not a Higgsfield price
  unitLabel: string;
  speed: SpeedTier;
  typicalQueue: string;
  controls: Partial<Record<"identity" | "text" | "layout" | "reference" | "motion" | "audio", boolean>>;
  maxResolution?: string;
  maxDurationSec?: number;
  jobType: string; // Higgsfield model id from `higgsfield model list`
  params?: Record<string, string | number | boolean>; // settings this lane implies on that model
  providerModelId?: string; // links to higgsfield/catalog.ts when runnable
  listed: boolean; // present in Higgsfield's live model list
  note?: string;
}

// prettier-ignore
export const ROUTER_CATALOG: RouterModel[] = [
  // --- SEARCH: images -----------------------------------------------------
  { id: "z-image", label: "Z Image", family: "Z Image", role: "search", medium: "image", strengths: "Cheapest, fastest idea generation and compositions from a prompt", failureMode: "No reference input; weak on exact text and brand control", costPerAttemptUsd: 0.02, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: {}, jobType: "z_image", listed: true },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite", family: "Nano Banana", role: "search", medium: "image", strengths: "Fast 1k concepts with up to 14 reference images", failureMode: "1k only; not a final-quality lane", costPerAttemptUsd: 0.03, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: { reference: true }, maxResolution: "1k", jobType: "nano_banana_2_lite", listed: true },
  { id: "seedream-v5-lite", label: "Seedream V5 Lite", family: "Seedream", role: "search", medium: "image", strengths: "Fast product and lifestyle concepts with reference input", failureMode: "Drifts from precise product geometry at low attempts", costPerAttemptUsd: 0.03, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: { reference: true }, jobType: "seedream_v5_lite", listed: true },
  { id: "flux-2", label: "FLUX.2", family: "Flux", role: "search", medium: "image", strengths: "Cheap compositions in pro, flex or max variants, with reference input", failureMode: "Weak at exact text and tight brand control", costPerAttemptUsd: 0.04, unitLabel: "per image", speed: "fast", typicalQueue: "seconds", controls: { reference: true }, maxResolution: "2k", jobType: "flux_2", listed: true },

  // --- SEARCH: video ------------------------------------------------------
  { id: "grok-video", label: "Grok Video", family: "Grok", role: "search", medium: "video", strengths: "Cheapest rough motion tests; an optional start image", failureMode: "Low fidelity; not final quality", costPerAttemptUsd: 0.2, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–2 min", controls: { motion: true, reference: true }, jobType: "grok_video", listed: true },
  { id: "wan-2-6", label: "Wan 2.6", family: "Wan", role: "search", medium: "video", strengths: "Low-cost video from image, video or audio references, 5–15s", failureMode: "Temporal flicker; reference-to-video limited to 5 or 10s", costPerAttemptUsd: 0.25, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true, audio: true }, maxResolution: "1080p", maxDurationSec: 15, jobType: "wan2_6", listed: true },
  { id: "seedance-2-0-mini", label: "Seedance 2.0 Mini", family: "Seedance", role: "search", medium: "video", strengths: "Fast concept footage from image, video and audio references, with generated audio", failureMode: "480p/720p only; consistency weaker than the premium lane", costPerAttemptUsd: 0.3, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true, audio: true }, maxResolution: "720p", jobType: "seedance_2_0_mini", listed: true },
  { id: "seedance-2-0-fast", label: "Seedance 2.0 (fast mode)", family: "Seedance", role: "search", medium: "video", strengths: "Seedance 2.0 in fast mode for quick reference-driven tests", failureMode: "Fast mode supports only 480p/720p", costPerAttemptUsd: 0.35, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true, audio: true }, maxResolution: "720p", jobType: "seedance_2_0", params: { mode: "fast" }, listed: true },
  { id: "veo-3-1-lite", label: "Veo 3.1 Lite", family: "Veo", role: "search", medium: "video", strengths: "Low-cost 4–8s clips with start and end frames and optional audio", failureMode: "Duration must be 8s when both frames are set", costPerAttemptUsd: 0.4, unitLabel: "per 8s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true, audio: true }, maxDurationSec: 8, jobType: "veo3_1_lite", listed: true },
  { id: "kling-3-0-turbo", label: "Kling 3.0 Turbo", family: "Kling", role: "search", medium: "video", strengths: "Fast Kling motion tests from a start image, up to 1080p", failureMode: "Occasional morphing on fast motion", costPerAttemptUsd: 0.45, unitLabel: "per 5s clip", speed: "fast", typicalQueue: "1–3 min", controls: { motion: true, reference: true }, maxResolution: "1080p", jobType: "kling3_0_turbo", listed: true },

  // --- CONTROL: images ----------------------------------------------------
  { id: "gpt-image-2-5", label: "GPT Image 2.5", family: "GPT Image", role: "control", medium: "image", strengths: "Exact on-image text, design and packaging; reference-guided edits with up to 16 references", failureMode: "Higher quality tiers (xhigh, max) cost more per attempt", costPerAttemptUsd: 0.1, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true, reference: true }, maxResolution: "4k", jobType: "gpt_image_2_5", listed: true, note: "Marked as the recommended default for high-fidelity images and on-image text in the Higgsfield model list." },
  { id: "gpt-image-2", label: "GPT Image 2 (edit / inpaint)", family: "GPT Image", role: "control", medium: "image_edit", strengths: "Precise edits and mask-based inpainting for packaging and text correction", failureMode: "Inpainting needs a mask and at least one reference image", costPerAttemptUsd: 0.09, unitLabel: "per edit", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true, reference: true }, maxResolution: "4k", jobType: "gpt_image_2", listed: true },
  { id: "flux-kontext", label: "Flux Kontext", family: "Flux", role: "control", medium: "image_edit", strengths: "Targeted edits that keep the rest of the image intact, up to 4 references", failureMode: "Can over-smooth edited regions", costPerAttemptUsd: 0.06, unitLabel: "per edit", speed: "standard", typicalQueue: "seconds", controls: { layout: true, reference: true }, jobType: "flux_kontext", listed: true },
  { id: "recraft-v4-1", label: "Recraft V4.1", family: "Recraft", role: "control", medium: "image", strengths: "Designed promotional assets, vector output, brand colors, posters", failureMode: "Less photoreal; stylised output", costPerAttemptUsd: 0.07, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { text: true, layout: true }, maxResolution: "2k", jobType: "recraft_v4_1", listed: true },
  { id: "kling-omni-image", label: "Kling O1 Image", family: "Kling", role: "control", medium: "image", strengths: "Reference-driven stills with up to 10 reference images", failureMode: "Aspect ratio 'auto' needs at least one reference", costPerAttemptUsd: 0.08, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, maxResolution: "2k", jobType: "kling_omni_image", listed: true },
  { id: "marketing-studio-image", label: "Marketing Studio Image", family: "Marketing Studio", role: "control", medium: "image", strengths: "Product and lifestyle variants with strong reference control, up to 14 references", failureMode: "Needs clean reference assets to lock geometry", costPerAttemptUsd: 0.09, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { reference: true, identity: true }, maxResolution: "4k", jobType: "marketing_studio_image", listed: true },
  { id: "soul-v2", label: "Higgsfield Soul V2", family: "Soul", role: "control", medium: "image", strengths: "Fashion, people and editorial taste; identity-consistent keyframes via a Soul ID", failureMode: "One image reference only; hands and edges need selects", costPerAttemptUsd: 0.06, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, maxResolution: "2k", jobType: "text2image_soul_v2", providerModelId: "soul-image", listed: true },

  // --- SHIP: images -------------------------------------------------------
  { id: "soul-cinematic", label: "Soul Cinematic", family: "Soul", role: "ship", medium: "image", strengths: "Cinematic final stills with a Soul ID for identity consistency", failureMode: "One image reference only; needs a retouch pass for hero use", costPerAttemptUsd: 0.12, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, maxResolution: "2k", jobType: "soul_cinematic", listed: true },
  { id: "nano-banana-pro", label: "Nano Banana Pro", family: "Nano Banana", role: "ship", medium: "image", strengths: "High-resolution final stills up to 4k with up to 14 references", failureMode: "Prompt or reference required; costlier than the lite lane", costPerAttemptUsd: 0.12, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, maxResolution: "4k", jobType: "nano_banana_2", listed: true },
  { id: "cinematic-studio-2-5", label: "Cinematic Studio 2.5", family: "Higgsfield", role: "ship", medium: "image", strengths: "Cinematic final stills up to 4k with up to 14 references and batch output", failureMode: "Overkill for social stills", costPerAttemptUsd: 0.14, unitLabel: "per image", speed: "standard", typicalQueue: "seconds", controls: { identity: true, reference: true }, maxResolution: "4k", jobType: "cinematic_studio_2_5", listed: true },

  // --- SHIP: video --------------------------------------------------------
  { id: "wan-2-7", label: "Wan 2.7", family: "Wan", role: "ship", medium: "video", strengths: "Start and end frame control with one audio reference, up to 1080p", failureMode: "Less physics-reliable than the top cinematic lanes", costPerAttemptUsd: 0.9, unitLabel: "per 5s clip", speed: "standard", typicalQueue: "2–6 min", controls: { motion: true, reference: true, audio: true }, maxResolution: "1080p", jobType: "wan2_7", listed: true },
  { id: "minimax-hailuo", label: "MiniMax Hailuo", family: "MiniMax", role: "ship", medium: "video", strengths: "Clean motion from start and end frames, up to 1080p (6s) in several variants", failureMode: "1080p is not available at 10s; some variants need a start image", costPerAttemptUsd: 0.8, unitLabel: "per 6s clip", speed: "standard", typicalQueue: "2–6 min", controls: { motion: true, reference: true }, maxResolution: "1080p", maxDurationSec: 10, jobType: "minimax_hailuo", listed: true },
  { id: "gemini-omni", label: "Gemini Omni Flash", family: "Gemini", role: "ship", medium: "video", strengths: "Reference-led clips from up to 7 images and one video reference, 4–10s", failureMode: "720p only", costPerAttemptUsd: 1.0, unitLabel: "per 8s clip", speed: "standard", typicalQueue: "2–6 min", controls: { motion: true, reference: true }, maxResolution: "720p", maxDurationSec: 10, jobType: "gemini_omni", listed: true },
  { id: "kling-3-0", label: "Kling v3.0", family: "Kling", role: "ship", medium: "video", strengths: "Cinematic camera and controlled motion from approved start and end frames, with sound; std, pro or 4k", failureMode: "Occasional morphing on fast motion", costPerAttemptUsd: 1.2, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "3–8 min", controls: { motion: true, reference: true, identity: true, audio: true }, maxResolution: "4k", jobType: "kling3_0", params: { mode: "pro" }, providerModelId: "kling-3-0-pro-t2v", listed: true },
  { id: "seedance-2-0", label: "Seedance 2.0", family: "Seedance", role: "ship", medium: "video", strengths: "Strong reference-driven premium motion up to 4k, with image, video and audio references and generated audio", failureMode: "Physics less reliable than the top cinematic lane", costPerAttemptUsd: 1.5, unitLabel: "per 5s clip", speed: "premium", typicalQueue: "3–8 min", controls: { motion: true, reference: true, identity: true, audio: true }, maxResolution: "4k", jobType: "seedance_2_0", params: { mode: "std" }, providerModelId: "seedance-2-0-t2v", listed: true },
  { id: "marketing-studio-video", label: "Marketing Studio Video", family: "Marketing Studio", role: "ship", medium: "audio_video", strengths: "UGC-style ad video with avatars, products and hooks, native audio, up to 1080p", failureMode: "Built for ads; less suited to cinematic work", costPerAttemptUsd: 1.8, unitLabel: "per 15s clip", speed: "premium", typicalQueue: "4–10 min", controls: { motion: true, reference: true, identity: true, audio: true }, maxResolution: "1080p", maxDurationSec: 15, jobType: "marketing_studio_video", listed: true },
  { id: "veo-3-1", label: "Google Veo 3.1", family: "Veo", role: "ship", medium: "video", strengths: "Premium cinematic motion and physics, quality up to ultra", failureMode: "Highest cost and longest queue; 8s maximum", costPerAttemptUsd: 2.5, unitLabel: "per 8s clip", speed: "premium", typicalQueue: "5–12 min", controls: { motion: true, reference: true }, maxDurationSec: 8, jobType: "veo3_1", listed: true },
  { id: "cinematic-studio-3-0", label: "Cinematic Studio 3.0", family: "Higgsfield", role: "ship", medium: "video", strengths: "Cinematic lensing, genre and multi-shot control up to 4k, with audio references", failureMode: "Expensive; overkill for social cutdowns", costPerAttemptUsd: 2.4, unitLabel: "per 5s shot", speed: "premium", typicalQueue: "4–10 min", controls: { motion: true, reference: true, identity: true, audio: true }, maxResolution: "4k", jobType: "cinematic_studio_3_0", listed: true },
  { id: "cinematic-studio-video-3-5", label: "Cinematic Studio Video 3.5", family: "Higgsfield", role: "ship", medium: "video", strengths: "Camera style, lighting and color-grading presets with up to 15 media references", failureMode: "Style axes and a style prompt cannot be combined; 1080p maximum", costPerAttemptUsd: 2.6, unitLabel: "per shot", speed: "premium", typicalQueue: "4–10 min", controls: { motion: true, reference: true, identity: true, audio: true }, maxResolution: "1080p", jobType: "cinematic_studio_video_3_5", listed: true },

  // --- FINISH -------------------------------------------------------------
  { id: "topaz-video", label: "Topaz Video", family: "Topaz", role: "finish", medium: "upscale", strengths: "High-quality video upscale and denoise for delivery masters", failureMode: "Can over-sharpen; needs a human eye", costPerAttemptUsd: 0.5, unitLabel: "per master", speed: "standard", typicalQueue: "1–3 min", controls: {}, jobType: "topaz_video", listed: true, note: "Parameters are not in the model list; run `higgsfield model get topaz_video`." },
  { id: "bytedance-video-upscale", label: "ByteDance Video Upscale", family: "ByteDance", role: "finish", medium: "upscale", strengths: "Fast, cheaper video upscale for social masters", failureMode: "Less detail recovery than premium upscalers", costPerAttemptUsd: 0.4, unitLabel: "per master", speed: "fast", typicalQueue: "1–2 min", controls: {}, jobType: "bytedance_video_upscale", listed: true, note: "Parameters are not in the model list; run `higgsfield model get bytedance_video_upscale`." },
  { id: "video-upscale", label: "Video Upscale", family: "Higgsfield", role: "finish", medium: "upscale", strengths: "General-purpose video upscale", failureMode: "Less control than the dedicated upscalers", costPerAttemptUsd: 0.35, unitLabel: "per master", speed: "fast", typicalQueue: "1–2 min", controls: {}, jobType: "video_upscale", listed: true, note: "Parameters are not in the model list; run `higgsfield model get video_upscale`." },
  { id: "topaz-image", label: "Topaz Image", family: "Topaz", role: "finish", medium: "upscale_image", strengths: "High-quality still upscale for delivery masters", failureMode: "Can over-sharpen; needs a human eye", costPerAttemptUsd: 0.15, unitLabel: "per master", speed: "standard", typicalQueue: "seconds", controls: {}, jobType: "topaz_image", listed: true, note: "Parameters are not in the model list; run `higgsfield model get topaz_image`." },
  { id: "bytedance-image-upscale", label: "ByteDance Image Upscale", family: "ByteDance", role: "finish", medium: "upscale_image", strengths: "Fast, cheaper still upscale for social masters", failureMode: "Less detail recovery than premium upscalers", costPerAttemptUsd: 0.1, unitLabel: "per master", speed: "fast", typicalQueue: "seconds", controls: {}, jobType: "bytedance_image_upscale", listed: true, note: "Parameters are not in the model list; run `higgsfield model get bytedance_image_upscale`." },
  { id: "inworld-tts", label: "Inworld Text to Speech", family: "Inworld", role: "finish", medium: "voice", strengths: "Narration and voiceover from 113 built-in voices", failureMode: "Prosody needs direction on long reads", costPerAttemptUsd: 0.2, unitLabel: "per VO take", speed: "fast", typicalQueue: "seconds", controls: { audio: true }, jobType: "inworld_text_to_speech", listed: true },
  { id: "text-to-speech-v2", label: "Text to Speech (ElevenLabs, MiniMax and others)", family: "Voice", role: "finish", medium: "voice", strengths: "Voiceover with a chosen engine (elevenlabs, minimax, seed_speech, vibe_voice, cozy_voice) and a preset or cloned voice", failureMode: "Needs a voice id; prompt length limits differ per engine", costPerAttemptUsd: 0.3, unitLabel: "per VO take", speed: "standard", typicalQueue: "seconds", controls: { audio: true }, jobType: "text2speech_v2", listed: true },
  { id: "seed-audio", label: "Seed Audio 1.0", family: "Seed", role: "finish", medium: "voice", strengths: "Speech with preset or cloned voices and rate, pitch and loudness control", failureMode: "A voice cannot be combined with an image reference", costPerAttemptUsd: 0.3, unitLabel: "per VO take", speed: "standard", typicalQueue: "seconds", controls: { audio: true }, jobType: "seed_audio", listed: true },
];

export function routerModel(id: string): RouterModel | null {
  return ROUTER_CATALOG.find((m) => m.id === id) ?? null;
}

export function byRole(role: RouterRole): RouterModel[] {
  return ROUTER_CATALOG.filter((m) => m.role === role);
}
