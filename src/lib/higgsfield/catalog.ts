import type { ModelCategory } from "@/lib/domain/types";

/**
 * Production model catalog for the Higgsfield API.
 *
 * `endpoint` is the path POSTed to on https://api.higgsfield.ai (Higgsfield exposes one submit
 * endpoint per model; results are polled through the returned status_url).
 * `verified: true` means the path was checked against docs.higgsfield.ai; the others are
 * placeholders to confirm in the Higgsfield API console before turning live mode on.
 *
 * `unitCostUsd` is a planning estimate per attempt (one image, one clip, one VO take, one render).
 * Higgsfield bills in credits; set real per-credit pricing here once known.
 */
export interface CatalogModel {
  id: string;
  label: string;
  category: ModelCategory;
  endpoint: string;
  verified: boolean;
  unitCostUsd: number;
  unitLabel: string;
  output: "image" | "video" | "audio";
  strengths: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "soul-image",
    label: "Soul (image)",
    category: "image",
    endpoint: "/higgsfield-ai/soul/standard",
    verified: false,
    unitCostUsd: 0.06,
    unitLabel: "per image",
    output: "image",
    strengths: "Photographic keyframes, look development, character and product stills",
  },
  {
    id: "ideogram-4",
    label: "Ideogram 4.0",
    category: "image",
    endpoint: "/ideogram/v4/generate",
    verified: false,
    unitCostUsd: 0.08,
    unitLabel: "per image",
    output: "image",
    strengths: "Exact on-screen text, title cards and end frames",
  },
  {
    id: "kling-o3-image-ref",
    label: "Kling O3 · image reference",
    category: "video",
    endpoint: "/kling-video/o3/image-reference",
    verified: true,
    unitCostUsd: 1.2,
    unitLabel: "per 5s clip",
    output: "video",
    strengths: "Animates approved keyframes with controlled camera moves",
  },
  {
    id: "cinema-studio",
    label: "Cinema Studio",
    category: "video",
    endpoint: "/higgsfield-ai/cinema-studio",
    verified: false,
    unitCostUsd: 2.4,
    unitLabel: "per 5s shot",
    output: "video",
    strengths: "Cinematic lensing, lighting and camera language for hero shots",
  },
  {
    id: "seedance-2-5-ref",
    label: "Seedance 2.5 · reference to video",
    category: "video",
    endpoint: "/bytedance/seedance-2-5/reference-to-video",
    verified: false,
    unitCostUsd: 0.9,
    unitLabel: "per 5s clip",
    output: "video",
    strengths: "Fast, consistent social cutdown footage from references",
  },
  {
    id: "voice-tts",
    label: "Voice · text to speech",
    category: "voice",
    endpoint: "/audio/text-to-speech",
    verified: false,
    unitCostUsd: 0.3,
    unitLabel: "per VO take",
    output: "audio",
    strengths: "Narration and voiceover takes",
  },
  {
    id: "edit-assemble",
    label: "Edit · assemble & conform",
    category: "editing",
    endpoint: "/video/edit/assemble",
    verified: false,
    unitCostUsd: 0.5,
    unitLabel: "per render",
    output: "video",
    strengths: "Sequences selected clips with VO, music bed and titles",
  },
  {
    id: "upscale-4k",
    label: "Finishing · upscale & grade",
    category: "finishing",
    endpoint: "/video/upscale",
    verified: false,
    unitCostUsd: 0.8,
    unitLabel: "per master",
    output: "video",
    strengths: "4K upscale, grain and final grade on delivery masters",
  },
];

export function getModel(id: string): CatalogModel {
  const m = MODEL_CATALOG.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model ${id}`);
  return m;
}
