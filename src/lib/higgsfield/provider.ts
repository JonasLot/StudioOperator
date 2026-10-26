import "server-only";
import { comfyProvider } from "@/lib/comfy/provider";
import { config, higgsfieldLive } from "@/lib/config";
import type { Generation, GenerationStatus } from "@/lib/domain/types";
import { getModel } from "./catalog";
import { WIRE_CAPABILITIES, wireCancel, wireConnectionTest, wirePoll, wireSubmit } from "./wire";

// ---------------------------------------------------------------------------
// Provider adapter boundary.
//
// The rest of the product talks only to this interface, never to Higgsfield
// directly. Outputs are normalized into one internal asset shape regardless of
// media type (image / video / audio). The live Higgsfield mapping lives behind
// `wire.ts` and is isolated + unverified; the mock implementation is complete
// and always available.
// ---------------------------------------------------------------------------

/** One internal asset shape for every media type the provider can return. */
export interface ProviderAsset {
  kind: "image" | "video" | "audio";
  url: string;
}

export interface ProviderCapabilities {
  estimate: boolean; // supports a pre-generation cost estimate
  cancel: boolean; // supports provider-side cancellation
  webhooks: boolean; // supports completion webhooks
}

export interface SubmitInput {
  generationId: string;
  modelId: string;
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: string | null; // the deliverable's ratio, e.g. "9:16"
  costEstimate: number;
}
export interface SubmitResult {
  providerRequestId: string;
  statusUrl: string | null;
  cancelUrl: string | null;
  status: GenerationStatus;
}
export interface PollResult {
  status: GenerationStatus;
  asset?: ProviderAsset | null;
  actualCost?: number | null; // provider-reported spend, when available
  error?: string | null;
}
export interface EstimateResult {
  estimatedCost: number | null;
  detail: string;
}
export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
}

export interface GenerationProvider {
  name: "higgsfield" | "mock" | "comfyui";
  live: boolean;
  capabilities: ProviderCapabilities;
  submit(input: SubmitInput): Promise<SubmitResult>;
  poll(gen: Generation): Promise<PollResult>;
  estimate?(input: SubmitInput): Promise<EstimateResult>;
  cancel?(gen: Generation): Promise<{ status: GenerationStatus }>;
  connectionTest(): Promise<ConnectionTestResult>;
}

// ---------------------------------------------------------------------------
// Mock provider — deterministic, time-based progress; fully offline.
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
  live: false,
  capabilities: { estimate: true, cancel: true, webhooks: false },
  async submit(input) {
    return { providerRequestId: `mock_${input.generationId.slice(-10)}`, statusUrl: null, cancelUrl: `mock-cancel:${input.generationId}`, status: "queued" };
  },
  async poll(gen) {
    const started = new Date(gen.startedAt ?? gen.createdAt).getTime();
    const elapsed = Date.now() - started;
    if (elapsed < MOCK_QUEUE_MS) return { status: "queued" };
    if (elapsed < MOCK_QUEUE_MS + MOCK_RENDER_MS) return { status: "in_progress" };
    const h = hash(gen.id);
    if (h % 19 === 0) return { status: "failed", error: "Mock provider: simulated render failure", actualCost: 0 };
    const model = getModel(gen.model);
    const variance = 0.9 + (h % 26) / 100; // 0.90 – 1.15
    return {
      status: "completed",
      asset: { kind: model.output, url: `/api/mock-output/${gen.id}` },
      actualCost: Math.round(gen.costEstimate * variance * 100) / 100,
    };
  },
  async estimate(input) {
    // In mock mode the catalog estimate is authoritative; echo it so the
    // "estimate before paid generation" path is exercised end-to-end.
    return { estimatedCost: input.costEstimate, detail: "Mock estimate (equals catalog estimate)." };
  },
  async cancel() {
    return { status: "canceled" };
  },
  async connectionTest() {
    return { ok: true, detail: "Mock provider — no network call and no cost." };
  },
};

// ---------------------------------------------------------------------------
// Higgsfield live provider — delegates every wire detail to wire.ts, which is
// isolated and refuses to run until its mapping is verified against the docs.
// ---------------------------------------------------------------------------

export const higgsfieldProvider: GenerationProvider = {
  name: "higgsfield",
  live: true,
  capabilities: WIRE_CAPABILITIES,
  async submit(input) {
    const r = await wireSubmit({ generationId: input.generationId, modelId: input.modelId, prompt: input.prompt, imageUrls: input.imageUrls, aspectRatio: input.aspectRatio });
    return { providerRequestId: r.providerRequestId, statusUrl: r.statusUrl, cancelUrl: r.cancelUrl, status: r.status };
  },
  async poll(gen) {
    const r = await wirePoll(gen);
    return {
      status: r.status,
      asset: r.assetUrl && r.assetKind ? { kind: r.assetKind, url: r.assetUrl } : null,
      actualCost: r.actualCost,
      error: r.error,
    };
  },
  async cancel(gen) {
    return wireCancel(gen);
  },
  async connectionTest() {
    return wireConnectionTest();
  },
};

/** Mock mode simulates everything. Otherwise local catalog models run on ComfyUI and the rest on Higgsfield (or the simulator without keys). */
export function getProvider(modelId?: string): GenerationProvider {
  if (config.mockMode) return mockProvider;
  if (modelId && getModel(modelId).local) return comfyProvider;
  return higgsfieldLive() ? higgsfieldProvider : mockProvider;
}
