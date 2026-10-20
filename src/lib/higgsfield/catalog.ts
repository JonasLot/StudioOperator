import type { ModelCategory } from "@/lib/domain/types";
import type { RequestSpec } from "./request";

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
  request?: RequestSpec; // the body fields this model takes; without it only { prompt, image_urls? } is sent
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "soul-image",
    label: "Soul (image)",
    category: "image",
    // Path from the Higgsfield image guide's quick start (higgsfield-ai/soul/standard).
    endpoint: "/higgsfield-ai/soul/standard",
    verified: true,
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
    // Path from the docs sample for Seedance 2.0 text-to-video; body fields (prompt, duration, resolution,
    // aspect_ratio) are the documented ones. Audio is left at the API default.
    id: "seedance-2-0-t2v",
    label: "Seedance 2.0 · text to video",
    category: "video",
    endpoint: "/bytedance/seedance-2.0/text-to-video",
    verified: true,
    unitCostUsd: 1.5,
    unitLabel: "per 5s clip",
    output: "video",
    strengths: "Fast, consistent social and cutdown footage from a prompt",
    request: { duration: 5, resolution: "720p", aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] },
  },
  {
    // Path from the Kling 3.0 Pro text-to-video reference. Body fields follow the CLI's parameters for
    // kling3_0 (prompt, duration, aspect_ratio); not confirmed against the REST schema, so a first live
    // run may answer 422 naming a field. A rejected submit is never charged.
    id: "kling-3-0-pro-t2v",
    label: "Kling 3.0 Pro · text to video",
    category: "video",
    endpoint: "/kling-video/v3.0/pro/text-to-video",
    verified: true,
    unitCostUsd: 1.2,
    unitLabel: "per 5s clip",
    output: "video",
    strengths: "Cinematic camera and controlled motion for hero shots",
    request: { duration: 5, aspectRatios: ["16:9", "9:16", "1:1"] },
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
    // Path from the Kling 3.0 Standard image-to-video reference. Animates one approved keyframe. The image field name
    // (image_url) and the planning price are assumptions: a first live run may answer 422 naming a field, and a
    // rejected submit is never charged.
    id: "kling-3-0-std-i2v",
    label: "Kling 3.0 Standard · image to video",
    category: "video",
    endpoint: "/kling-video/v3.0/std/image-to-video",
    verified: true,
    unitCostUsd: 0.9,
    unitLabel: "per 5s clip",
    output: "video",
    strengths: "Animates an approved keyframe into a clip at a lower price than Pro",
    request: { duration: 5, imageField: "image_url" },
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
    // The documented path uses dots ("seedance-2.5"); the earlier dashed spelling answered 404 model_not_found.
    endpoint: "/bytedance/seedance-2.5/reference-to-video",
    verified: true,
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
