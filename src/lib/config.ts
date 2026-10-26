import "server-only";
import type { JobSource } from "@/lib/domain/types";
import { secretValue } from "@/lib/secrets";
import { normalizeHiggsfieldPair } from "@/lib/secrets/crypto";
import { draftModelSetting, isMockForced, isMockMode, operatorName } from "@/lib/settings";

// Server-only configuration. Secrets are read here and never serialised to the client.
// Anything the UI needs to know is exposed through publicConfig() without secret values.

function num(v: string | undefined, fallback: number) {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Pasted env values often arrive wrapped in quotes or with a stray newline/space.
// A URL never legitimately contains quotes or whitespace, so strip both.
function cleanEnv(v: string | undefined) {
  return (v || "").trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, "");
}

// The local SQLite file. Override with DATABASE_PATH; defaults to ./data/studio.db.
function defaultDatabasePath() {
  return process.env.DATABASE_PATH || "./data/studio.db";
}

export const config = {
  // Mock mode can be switched on the Settings page; that choice wins over STUDIO_MOCK_MODE.
  get mockMode() {
    return isMockMode();
  },
  databasePath: defaultDatabasePath(),

  // Local generation through ComfyUI (the "local-*" catalog models). Nothing leaves this machine.
  comfy: {
    url: cleanEnv(process.env.COMFYUI_URL) || "http://127.0.0.1:8188",
    workflowDir: process.env.COMFYUI_WORKFLOW_DIR || "./comfy-workflows",
    imageLongSide: num(process.env.COMFYUI_IMAGE_SIZE, 1024),
    videoLongSide: num(process.env.COMFYUI_VIDEO_SIZE, 768),
  },

  // GPT-6 Astra, called through the OpenAI Responses API (the real intake
  // analysis layer). The key is read here, server-side, and never serialised to
  // the client. OPENAI_API_KEY is the primary name; ASTRA_API_KEY is accepted
  // as a fallback for older setups.
  openai: {
    // A key saved on the Settings page wins over the environment variable (see lib/secrets).
    get apiKey() {
      return secretValue("openaiApiKey");
    },
    baseUrl: (process.env.OPENAI_BASE_URL || process.env.ASTRA_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || process.env.ASTRA_MODEL || "gpt-6-astra",
  },

  // First-phase AI: a cheap or local model behind an OpenAI-compatible /chat/completions endpoint (Ollama,
  // LM Studio, OpenRouter, OpenAI). It drafts the creative brief; Astra then sharpens it. The endpoint and
  // model saved on the Settings page win over the environment; the key is optional (local models need none).
  draft: {
    get baseUrl() {
      return draftModelSetting()?.baseUrl ?? (process.env.DRAFT_AI_BASE_URL || "").trim().replace(/\/+$/, "");
    },
    get model() {
      return draftModelSetting()?.model ?? (process.env.DRAFT_AI_MODEL || "").trim();
    },
    get apiKey() {
      return secretValue("draftApiKey");
    },
  },

  // Higgsfield generation provider. Credentials are read here, server-side only,
  // and must never be logged, serialised to the client, or put in error messages
  // (see scrubSecrets). HF_API_KEY_ID / HF_API_KEY_SECRET are the primary names;
  // HIGGSFIELD_* are accepted as fallbacks.
  higgsfield: {
    get apiKeyId() {
      return normalizeHiggsfieldPair(secretValue("hfApiKeyId"), secretValue("hfApiKeySecret")).id;
    },
    get apiKeySecret() {
      return normalizeHiggsfieldPair(secretValue("hfApiKeyId"), secretValue("hfApiKeySecret")).secret;
    },
    baseUrl: (process.env.HIGGSFIELD_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, ""),
    // The live Higgsfield wire mapping is UNVERIFIED against the official docs.
    // It refuses to make network calls unless this is explicitly set to "true",
    // so we never hit guessed endpoints or spend money on assumptions.
    wireEnabled: process.env.HIGGSFIELD_WIRE_ENABLED === "true",
  },

  // Absolute origin the provider can reach, used to turn stored outputs (/api/asset/…) into reference-image URLs
  // for the next step. Set APP_URL (e.g. a tunnel URL) if the provider needs to fetch them.
  publicBaseUrl: (() => {
    const raw = cleanEnv(process.env.APP_URL);
    if (!raw) return "";
    return (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/$/, "");
  })(),

  // Production polling. The app-level timeout is tracked separately from the
  // provider's own status and is never reported as a provider status.
  generation: {
    timeoutMs: num(process.env.GENERATION_TIMEOUT_MS, 1000 * 60 * 10), // 10 min per attempt
  },

  // Automated-QA repair limits. A QA-driven repair runs automatically only within
  // all of these; anything larger requires explicit human approval.
  qa: {
    perRepairMaxUsd: num(process.env.QA_PER_REPAIR_MAX_USD, 8),
    perJobRepairMaxUsd: num(process.env.QA_PER_JOB_REPAIR_MAX_USD, 25),
    maxAutoRepairsPerJob: num(process.env.QA_MAX_AUTO_REPAIRS, 2),
    repairAttempts: num(process.env.QA_REPAIR_ATTEMPTS, 2),
  },

  economics: {
    defaultContingencyPct: num(process.env.DEFAULT_CONTINGENCY_PCT, 0.2),
    minGrossMarginPct: num(process.env.MIN_GROSS_MARGIN_PCT, 0.45),
    rejectBelowMarginPct: num(process.env.REJECT_BELOW_MARGIN_PCT, 0.15),
    // Hard ceiling on generation spend + contingency for a single job. A plan
    // whose deterministic cost exceeds this is rejected outright.
    maxProductionBudgetUsd: num(process.env.MAX_PRODUCTION_BUDGET_USD, 2000),
    // Attempt limit applied per planned step when pricing the model's estimate.
    maxAttemptsPerStep: num(process.env.MAX_ATTEMPTS_PER_STEP, 40),
    // Below this confidence the job is routed to human review.
    minConfidencePct: num(process.env.MIN_CONFIDENCE_PCT, 55),
    // More missing assets than this routes the job to human review.
    maxMissingAssets: num(process.env.MAX_MISSING_ASSETS, 2),
    sourceFeePct: {
      upwork: num(process.env.FEE_UPWORK_PCT, 0.1),
      fiverr: num(process.env.FEE_FIVERR_PCT, 0.2),
      contra: num(process.env.FEE_CONTRA_PCT, 0),
      email: num(process.env.FEE_EMAIL_PCT, 0),
      direct: num(process.env.FEE_DIRECT_PCT, 0),
    } satisfies Record<JobSource, number>,
  },

  // Defaults used to seed the single account-level Autonomy Settings row. Once a
  // human edits the settings in the Autonomy screen, the stored row wins — these
  // only apply on first seed / demo reset.
  autonomy: {
    maxAutoSpendPerJobUsd: num(process.env.AUTONOMY_MAX_JOB_SPEND_USD, 60),
    maxAutoSpendPerRepairUsd: num(process.env.AUTONOMY_MAX_REPAIR_SPEND_USD, 8),
    maxAttemptsPerStep: num(process.env.AUTONOMY_MAX_ATTEMPTS_PER_STEP, 16),
    // Catalog model families the agent may choose on its own.
    allowedModelFamilies: (process.env.AUTONOMY_ALLOWED_FAMILIES || "soul,cinema,kling,seedance,ideogram,edit,upscale,voice,local")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Message types that may be SENT automatically (on an allowed channel). Everything
    // else is drafted for human approval. Marketplace channels are never auto-sent.
    autoSendMessageTypes: (process.env.AUTONOMY_AUTOSEND || "progress_update")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    autoShareConcepts: process.env.AUTONOMY_AUTO_SHARE_CONCEPTS === "true",
    finalDeliveryAlwaysApproval: process.env.AUTONOMY_DELIVERY_ALWAYS_APPROVAL !== "false",
  },

  // The name approvals and audit entries are recorded under (Profile page; OPERATOR_NAME is the default).
  get operatorName() {
    return operatorName();
  },
};

// Real GPT-6 Astra analysis runs when an API key is present, unless mock mode
// is explicitly forced on. (The default unset state lets the key decide.)
export function openaiLive() {
  return config.openai.apiKey.length > 0 && !isMockForced();
}

/** Whether brief analysis is live (UI label). Same switch as openaiLive: there is one analyzer. */
export function astraLive() {
  return openaiLive();
}

/** Whether the first-phase AI drafts for real: an endpoint and a model are set and mock mode is not forced. */
export function draftLive() {
  return config.draft.baseUrl.length > 0 && config.draft.model.length > 0 && !isMockForced();
}

export function higgsfieldLive() {
  return !config.mockMode && config.higgsfield.apiKeyId.length > 0 && config.higgsfield.apiKeySecret.length > 0;
}

// Remove any occurrence of the Higgsfield credentials from a string before it is
// logged, persisted, shown to the user, or put in an error message. Defensive:
// credentials must never appear anywhere outside the server-side fetch itself.
export function scrubSecrets(input: string): string {
  let out = input;
  for (const secret of [config.higgsfield.apiKeySecret, config.higgsfield.apiKeyId, config.openai.apiKey, config.draft.apiKey]) {
    if (secret && secret.length >= 6) out = out.split(secret).join("«redacted»");
  }
  return out;
}

export function publicConfig() {
  return {
    mockMode: config.mockMode,
    astraLive: astraLive(),
    openaiLive: openaiLive(),
    higgsfieldLive: higgsfieldLive(),
    astraModel: config.openai.model,
    draftLive: draftLive(),
    draftModel: config.draft.model,
    sourceFeePct: config.economics.sourceFeePct,
    defaultContingencyPct: config.economics.defaultContingencyPct,
    minGrossMarginPct: config.economics.minGrossMarginPct,
  };
}
