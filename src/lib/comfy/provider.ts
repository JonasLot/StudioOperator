import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import type { Generation, GenerationStatus } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import type { GenerationProvider } from "@/lib/higgsfield/provider";
import { fillTemplate, pickOutput, sizeForRatio, unfilledPlaceholders, type ComfyFile } from "./workflow";

// ---------------------------------------------------------------------------
// Local generation through ComfyUI's HTTP API. Nothing leaves this machine and nothing is billed.
// Workflows are templates in COMFYUI_WORKFLOW_DIR (image.json, video.json); see comfy-workflows/README.md.
// ---------------------------------------------------------------------------

const FPS = 24;

function base() {
  return config.comfy.url;
}

function templateFor(output: "image" | "video" | "audio") {
  const file = path.resolve(config.comfy.workflowDir, `${output}.json`);
  if (!fs.existsSync(file)) throw new Error(`No ComfyUI workflow template at ${file}. Export one with "Save (API Format)" — see comfy-workflows/README.md.`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

async function comfy(pathname: string, init?: RequestInit) {
  try {
    return await fetch(`${base()}${pathname}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error(`ComfyUI is not reachable at ${base()}. Start it (python main.py) or set COMFYUI_URL.`);
  }
}

function viewUrl(f: ComfyFile) {
  const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? "", type: f.type ?? "output" });
  return `${base()}/view?${q}`;
}

export const comfyProvider: GenerationProvider = {
  name: "comfyui",
  live: true,
  capabilities: { estimate: false, cancel: true, webhooks: false },

  async submit(input) {
    const model = getModel(input.modelId);
    if (model.output === "audio") throw new Error("The local ComfyUI provider makes images and video only.");
    const spec = model.request;
    const duration = spec?.duration ?? 5;
    const { width, height } = sizeForRatio(input.aspectRatio, model.output === "video" ? config.comfy.videoLongSide : config.comfy.imageLongSide);
    const prompt = fillTemplate(templateFor(model.output), {
      prompt: input.prompt,
      seed: Math.floor(Math.random() * 2 ** 31),
      width,
      height,
      duration,
      fps: FPS,
      frames: duration * FPS,
    });
    const missing = unfilledPlaceholders(prompt);
    if (missing.length) throw new Error(`The ${model.output} workflow template uses unknown placeholders: ${missing.map((m) => `{{${m}}}`).join(", ")}.`);
    const res = await comfy("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, client_id: input.generationId }) });
    const body = (await res.json().catch(() => ({}))) as { prompt_id?: string; error?: { message?: string }; node_errors?: Record<string, unknown> };
    if (!res.ok || !body.prompt_id) {
      const nodes = body.node_errors && Object.keys(body.node_errors).length ? ` (nodes: ${Object.keys(body.node_errors).join(", ")})` : "";
      throw new Error(`ComfyUI rejected the workflow: ${body.error?.message ?? res.status}${nodes}`);
    }
    return { providerRequestId: body.prompt_id, statusUrl: null, cancelUrl: null, status: "queued" as GenerationStatus };
  },

  async poll(gen: Generation) {
    const id = gen.providerRequestId;
    if (!id) return { status: "failed", error: "No ComfyUI prompt id was recorded." };
    const hist = (await (await comfy(`/history/${encodeURIComponent(id)}`)).json().catch(() => ({}))) as Record<
      string,
      { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string; completed?: boolean; messages?: unknown[][] } }
    >;
    const entry = hist[id];
    if (!entry) {
      const q = (await (await comfy("/queue")).json().catch(() => ({}))) as { queue_running?: unknown[][] };
      const running = (q.queue_running ?? []).some((e) => e[1] === id);
      return { status: running ? "in_progress" : "queued" };
    }
    if (entry.status?.status_str === "error") {
      const err = entry.status.messages?.find((m) => m[0] === "execution_error")?.[1] as { exception_message?: string } | undefined;
      return { status: "failed", error: `ComfyUI: ${err?.exception_message ?? "execution error"}`, actualCost: 0 };
    }
    if (!entry.status?.completed) return { status: "in_progress" };
    const kind = getModel(gen.model).output === "video" ? "video" : "image";
    const file = pickOutput(entry.outputs, kind);
    if (!file) return { status: "failed", error: "ComfyUI finished but the workflow saved no output. Add a Save Image / Video Combine node.", actualCost: 0 };
    return { status: "completed", asset: { kind, url: viewUrl(file) }, actualCost: 0 };
  },

  async cancel(gen: Generation) {
    await comfy("/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: [gen.providerRequestId] }) });
    return { status: "canceled" as GenerationStatus };
  },

  async connectionTest() {
    const res = await comfy("/system_stats");
    if (!res.ok) return { ok: false, detail: `ComfyUI answered ${res.status} at ${base()}.` };
    const missing = (["image", "video"] as const).filter((k) => !fs.existsSync(path.resolve(config.comfy.workflowDir, `${k}.json`)));
    return missing.length
      ? { ok: false, detail: `ComfyUI is running at ${base()}, but no workflow template for: ${missing.join(", ")} (in ${config.comfy.workflowDir}).` }
      : { ok: true, detail: `ComfyUI is running at ${base()}; image and video workflow templates found.` };
  },
};
