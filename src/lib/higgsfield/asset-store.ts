import "server-only";
import { scrubSecrets } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { newId } from "@/lib/services/ids";
import type { ProviderAsset } from "./provider";

// ---------------------------------------------------------------------------
// Copy a completed output into application-controlled storage. Provider URLs can
// expire, so we fetch the bytes once and keep our own copy (served by
// /api/asset/[id]). Assets that are already app-controlled (e.g. the mock
// provider's own /api/mock-output URLs) are left as-is.
// ---------------------------------------------------------------------------

const DEFAULT_MIME: Record<ProviderAsset["kind"], string> = {
  image: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg",
};

export interface PersistResult {
  storedUrl: string;
  copied: boolean;
  note: string | null;
}

export async function persistAsset(jobId: string, generationId: string, asset: ProviderAsset): Promise<PersistResult> {
  // Already served by this application — nothing to copy.
  if (asset.url.startsWith("/")) return { storedUrl: asset.url, copied: false, note: null };

  try {
    const res = await fetch(asset.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim() || DEFAULT_MIME[asset.kind];
    const id = newId("as");
    getRepo().insertAsset({
      id,
      generationId,
      jobId,
      kind: asset.kind,
      mime,
      data: buf.toString("base64"),
      sourceUrl: asset.url,
      bytes: buf.byteLength,
      createdAt: new Date().toISOString(),
    });
    return { storedUrl: `/api/asset/${id}`, copied: true, note: null };
  } catch (err) {
    // Keep the (possibly expiring) provider URL as a fallback, and report why.
    return { storedUrl: asset.url, copied: false, note: scrubSecrets((err as Error).message) };
  }
}
