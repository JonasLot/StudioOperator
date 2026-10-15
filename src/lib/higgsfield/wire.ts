import "server-only";
import { config, scrubSecrets } from "@/lib/config";
import type { Generation, GenerationStatus } from "@/lib/domain/types";
import { getModel } from "./catalog";

// ===========================================================================
// ⚠️  UNVERIFIED HIGGSFIELD WIRE MAPPING  ⚠️
//
// This is the ONLY module that encodes assumptions about Higgsfield's HTTP
// surface — endpoint paths, request fields, response shapes, status strings,
// the auth header format and the cost/price fields. Those assumptions were NOT
// confirmed against the official documentation or the real model pages (the
// docs host is not reachable from the build environment), so they may be wrong.
//
// Until each line below is checked against https://docs.higgsfield.ai and the
// exact model pages — or replaced with the official TypeScript SDK — this module
// REFUSES to make any network call. Enable it only after verifying the shapes,
// by setting HIGGSFIELD_WIRE_ENABLED=true. Everything else in the app (adapter
// boundary, lifecycle, ledger, assets, cancel/retry, connection test, mock mode)
// is provider-agnostic and does not depend on anything in this file.
//
// Credentials are read from config here, server-side only, and are never logged
// or returned in errors (all throws pass through scrubSecrets).
// ===========================================================================

export class UnverifiedWireError extends Error {
  constructor() {
    super(
      "Higgsfield live calls are disabled: the wire mapping is unverified against the official API docs. " +
        "Verify endpoints/fields/response shapes (or wire the official SDK), then set HIGGSFIELD_WIRE_ENABLED=true.",
    );
    this.name = "UnverifiedWireError";
  }
}

// Capabilities as suggested by third-party sources — UNCONFIRMED. The adapter
// exposes these so the UI can reflect them, but no call runs until verified.
export const WIRE_CAPABILITIES = { estimate: false, cancel: true, webhooks: false } as const;

function assertEnabled() {
  if (!config.higgsfield.wireEnabled) throw new UnverifiedWireError();
}

// Server-side only. Never logged. Format is UNVERIFIED (docs show "Key id:secret"
// on Authorization; legacy hf-api-key/hf-secret headers may also be accepted).
function authHeaders(): Record<string, string> {
  return { Authorization: `Key ${config.higgsfield.apiKeyId}:${config.higgsfield.apiKeySecret}` };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return scrubSecrets(`${res.status} ${text.slice(0, 300)}`);
}

export interface WireSubmit {
  providerRequestId: string;
  statusUrl: string | null;
  cancelUrl: string | null;
  status: GenerationStatus;
}

export async function wireSubmit(input: { generationId: string; modelId: string; prompt: string; imageUrls?: string[] }): Promise<WireSubmit> {
  assertEnabled();
  const model = getModel(input.modelId);
  try {
    const res = await fetch(`${config.higgsfield.baseUrl}${model.endpoint}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json", "Idempotency-Key": input.generationId },
      body: JSON.stringify({ prompt: input.prompt, ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}) }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Higgsfield submit failed: ${await readError(res)}`);
    const body = (await res.json()) as { request_id: string; status_url?: string; cancel_url?: string; status?: GenerationStatus };
    return {
      providerRequestId: body.request_id,
      statusUrl: body.status_url ?? `${config.higgsfield.baseUrl}/requests/${body.request_id}/status`,
      cancelUrl: body.cancel_url ?? null,
      status: body.status ?? "queued",
    };
  } catch (err) {
    throw new Error(scrubSecrets((err as Error).message));
  }
}

export interface WirePoll {
  status: GenerationStatus;
  assetUrl: string | null;
  assetKind: "image" | "video" | "audio" | null;
  actualCost: number | null;
  error: string | null;
}

export async function wirePoll(gen: Generation): Promise<WirePoll> {
  assertEnabled();
  const url = gen.statusUrl ?? `${config.higgsfield.baseUrl}/requests/${gen.providerRequestId}/status`;
  try {
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return { status: gen.status, assetUrl: null, assetKind: null, actualCost: null, error: `Status check failed: ${await readError(res)}` };
    const body = (await res.json()) as {
      status: GenerationStatus;
      images?: { url: string }[];
      video?: { url: string };
      audio?: { url: string };
      audios?: { url: string }[];
      cost?: number;
      error?: string;
    };
    if (body.status === "completed") {
      const assetUrl = body.video?.url ?? body.images?.[0]?.url ?? body.audio?.url ?? body.audios?.[0]?.url ?? null;
      const assetKind = body.video ? "video" : body.images ? "image" : body.audio || body.audios ? "audio" : null;
      return { status: "completed", assetUrl, assetKind, actualCost: typeof body.cost === "number" ? body.cost : null, error: null };
    }
    if (body.status === "nsfw") return { status: "nsfw", assetUrl: null, assetKind: null, actualCost: null, error: "Rejected by provider content moderation." };
    if (body.status === "failed") return { status: "failed", assetUrl: null, assetKind: null, actualCost: null, error: scrubSecrets(body.error ?? "Provider reported failure.") };
    return { status: body.status, assetUrl: null, assetKind: null, actualCost: null, error: null };
  } catch (err) {
    return { status: gen.status, assetUrl: null, assetKind: null, actualCost: null, error: scrubSecrets((err as Error).message) };
  }
}

export async function wireCancel(gen: Generation): Promise<{ status: GenerationStatus }> {
  assertEnabled();
  try {
    const url = `${config.higgsfield.baseUrl}/requests/${gen.providerRequestId}/cancel`;
    const res = await fetch(url, { method: "POST", headers: authHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Cancel failed: ${await readError(res)}`);
    return { status: "canceled" };
  } catch (err) {
    throw new Error(scrubSecrets((err as Error).message));
  }
}

export async function wireConnectionTest(): Promise<{ ok: boolean; detail: string }> {
  assertEnabled();
  // Smallest documented authenticated request. Endpoint UNVERIFIED — adjust to the
  // cheapest GET the docs expose (e.g. an account/models listing).
  try {
    const res = await fetch(`${config.higgsfield.baseUrl}/v1/models`, { headers: authHeaders(), cache: "no-store" });
    return { ok: res.ok, detail: res.ok ? `Provider responded ${res.status}.` : `Provider responded ${await readError(res)}` };
  } catch (err) {
    return { ok: false, detail: scrubSecrets((err as Error).message) };
  }
}
