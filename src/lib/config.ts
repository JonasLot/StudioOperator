import "server-only";
import type { JobSource } from "@/lib/domain/types";

// Server-only configuration. Secrets are read here and never serialised to the client.
// Anything the UI needs to know is exposed through publicConfig() without secret values.

function num(v: string | undefined, fallback: number) {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  mockMode: process.env.STUDIO_MOCK_MODE !== "false",
  databasePath: process.env.DATABASE_PATH || "./data/studio.db",

  astra: {
    apiKey: process.env.ASTRA_API_KEY || "",
    baseUrl: (process.env.ASTRA_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.ASTRA_MODEL || "gpt-6-astra",
  },

  higgsfield: {
    apiKeyId: process.env.HIGGSFIELD_API_KEY_ID || "",
    apiKeySecret: process.env.HIGGSFIELD_API_KEY_SECRET || "",
    baseUrl: (process.env.HIGGSFIELD_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, ""),
  },

  economics: {
    defaultContingencyPct: num(process.env.DEFAULT_CONTINGENCY_PCT, 0.2),
    minGrossMarginPct: num(process.env.MIN_GROSS_MARGIN_PCT, 0.45),
    rejectBelowMarginPct: num(process.env.REJECT_BELOW_MARGIN_PCT, 0.15),
    sourceFeePct: {
      upwork: num(process.env.FEE_UPWORK_PCT, 0.1),
      fiverr: num(process.env.FEE_FIVERR_PCT, 0.2),
      contra: num(process.env.FEE_CONTRA_PCT, 0),
      email: num(process.env.FEE_EMAIL_PCT, 0),
      direct: num(process.env.FEE_DIRECT_PCT, 0),
    } satisfies Record<JobSource, number>,
  },

  operatorName: process.env.OPERATOR_NAME || "Operator",
};

export function astraLive() {
  return !config.mockMode && config.astra.apiKey.length > 0;
}

export function higgsfieldLive() {
  return !config.mockMode && config.higgsfield.apiKeyId.length > 0 && config.higgsfield.apiKeySecret.length > 0;
}

export function publicConfig() {
  return {
    mockMode: config.mockMode,
    astraLive: astraLive(),
    higgsfieldLive: higgsfieldLive(),
    astraModel: config.astra.model,
    sourceFeePct: config.economics.sourceFeePct,
    defaultContingencyPct: config.economics.defaultContingencyPct,
    minGrossMarginPct: config.economics.minGrossMarginPct,
  };
}
