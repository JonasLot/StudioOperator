// ---------------------------------------------------------------------------
// Request body for a Higgsfield model endpoint.
//
// Models differ in the fields they take (duration, resolution, aspect_ratio, ...), so each
// catalog entry can carry a `RequestSpec` that says which to send. Pure module (no
// server-only, no "@/..." imports) so it can be unit-tested directly.
// ---------------------------------------------------------------------------

export interface RequestSpec {
  duration?: number; // seconds, sent as `duration`
  resolution?: string; // sent as `resolution`
  aspectRatios?: readonly string[]; // allowed `aspect_ratio` values; the first is the fallback
  extra?: Record<string, unknown>; // any other fixed body fields
}

export interface RequestInput {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string | null; // the deliverable's ratio, e.g. "9:16"; used when the model allows it
}

/** Whether the model takes reference images: models without a spec send { prompt, image_urls? }, models with one send only their documented fields. */
export function acceptsImageUrls(spec: RequestSpec | undefined): boolean {
  return !spec;
}

/** "16x9", "16/9" and "16×9" all mean "16:9". */
export function normalizeAspectRatio(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\s*[:x×/]\s*(\d{1,2})$/i);
  return m ? `${Number(m[1])}:${Number(m[2])}` : null;
}

/**
 * The body to POST. Models without a spec keep the original shape ({ prompt, image_urls? }); models with a
 * spec send exactly the documented fields. The requested aspect ratio is used when the model allows it,
 * otherwise the model's first allowed ratio.
 */
export function buildRequestBody(spec: RequestSpec | undefined, input: RequestInput): Record<string, unknown> {
  if (!spec) return { prompt: input.prompt, ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}) };
  const body: Record<string, unknown> = { prompt: input.prompt };
  if (spec.duration !== undefined) body.duration = spec.duration;
  if (spec.resolution !== undefined) body.resolution = spec.resolution;
  if (spec.aspectRatios?.length) {
    const wanted = normalizeAspectRatio(input.aspectRatio);
    body.aspect_ratio = wanted && spec.aspectRatios.includes(wanted) ? wanted : spec.aspectRatios[0];
  }
  return { ...body, ...spec.extra };
}
