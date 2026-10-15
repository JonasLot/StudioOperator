import "server-only";
import { config, higgsfieldLive } from "@/lib/config";
import type { Generation, GenerationStatus } from "@/lib/domain/types";
import { getModel } from "./catalog";

export interface SubmitInput {
  generationId: string;
  modelId: string;
  prompt: string;
  imageUrls?: string[];
  costEstimate: number;
}

export interface SubmitResult {
  providerRequestId: string;
  statusUrl: string | null;
  status: GenerationStatus;
}

export interface PollResult {
  status: GenerationStatus;
  outputUrl?: string | null;
  outputType?: "image" | "video" | "audio" | null;
  actualCost?: number | null;
  error?: string | null;
}

export interface GenerationProvider {
  name: "higgsfield" | "mock";
  submit(input: SubmitInput): Promise<SubmitResult>;
  poll(gen: Generation): Promise<PollResult>;
}

// ---------------------------------------------------------------------------
// Mock provider — deterministic, time-based progress so the whole UI can be exercised offline.
// ---------------------------------------------------------------------------

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const MOCK_QUEUE_MS = 1500;
const MOCK_RENDER_MS = 4500;

export const mockProvider: GenerationProvider = {
  name: "mock",
  async submit(input) {
    return { providerRequestId: `mock_${input.generationId.slice(-10)}`, statusUrl: null, status: "queued" };
  },
  async poll(gen) {
    const started = new Date(gen.startedAt ?? gen.createdAt).getTime();
    const elapsed = Date.now() - started;
    if (elapsed < MOCK_QUEUE_MS) return { status: "queued" };
    if (elapsed < MOCK_QUEUE_MS + MOCK_RENDER_MS) return { status: "in_progress" };
    const h = hash(gen.id);
    if (h % 19 === 0) {
      return { status: "failed", error: "Mock provider: render timed out at 120s (simulated)", actualCost: 0 };
    }
    const model = getModel(gen.model);
    const variance = 0.9 + ((h % 26) / 100); // 0.90 – 1.15
    return {
      status: "completed",
      outputUrl: `/api/mock-output/${gen.id}`,
      outputType: model.output,
      actualCost: Math.round(gen.costEstimate * variance * 100) / 100,
    };
  },
};

// ---------------------------------------------------------------------------
// Higgsfield live provider — https://docs.higgsfield.ai
//   POST {base}/{model endpoint}   Authorization: Key {id}:{secret}, Idempotency-Key
//   -> { request_id, status_url, cancel_url, status }
//   GET status_url -> { status: queued|in_progress|completed|failed|nsfw|canceled, images[] | video | audio }
// ---------------------------------------------------------------------------

function authHeader() {
  return `Key ${config.higgsfield.apiKeyId}:${config.higgsfield.apiKeySecret}`;
}

export const higgsfieldProvider: GenerationProvider = {
  name: "higgsfield",
  async submit(input) {
    const model = getModel(input.modelId);
    const res = await fetch(`${config.higgsfield.baseUrl}${model.endpoint}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "Idempotency-Key": input.generationId,
      },
      body: JSON.stringify({
        prompt: input.prompt,
        ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Higgsfield submit failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { request_id: string; status_url?: string; status?: GenerationStatus };
    return {
      providerRequestId: body.request_id,
      statusUrl: body.status_url ?? `${config.higgsfield.baseUrl}/requests/${body.request_id}/status`,
      status: body.status ?? "queued",
    };
  },
  async poll(gen) {
    const url = gen.statusUrl ?? `${config.higgsfield.baseUrl}/requests/${gen.providerRequestId}/status`;
    const res = await fetch(url, { headers: { Authorization: authHeader() }, cache: "no-store" });
    if (!res.ok) return { status: gen.status, error: `Status check failed (${res.status})` };
    const body = (await res.json()) as {
      status: GenerationStatus;
      images?: { url: string }[];
      video?: { url: string };
      audio?: { url: string };
      audios?: { url: string }[];
      error?: string;
    };
    if (body.status === "completed") {
      const outputUrl = body.video?.url ?? body.images?.[0]?.url ?? body.audio?.url ?? body.audios?.[0]?.url ?? null;
      const outputType = body.video ? "video" : body.images ? "image" : body.audio || body.audios ? "audio" : null;
      // Higgsfield bills in credits; the status payload does not report spend, so actual cost stays null
      // until reconciled from the console. Budget guardrails fall back to the estimate.
      return { status: "completed", outputUrl, outputType, actualCost: null };
    }
    if (body.status === "nsfw") return { status: "nsfw", error: "Rejected by provider content moderation" };
    if (body.status === "failed") return { status: "failed", error: body.error ?? "Provider reported failure" };
    return { status: body.status };
  },
};

export function getProvider(): GenerationProvider {
  return higgsfieldLive() ? higgsfieldProvider : mockProvider;
}
