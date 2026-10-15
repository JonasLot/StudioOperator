import "server-only";
import { config, openaiLive } from "@/lib/config";
import { mockAnalyze, type AnalyzerInput } from "./mock";
import { AnalysisSchema, parseAnalysis, type Analysis } from "./schema";
import { extractOutputText, parseOutputJson, toStrictJsonSchema } from "./responses";

// ---------------------------------------------------------------------------
// Real brief analysis via the OpenAI Responses API (model: gpt-6-astra) with
// Structured Outputs. The API key is read here, server-side, and never leaves
// the server. The model's JSON is validated against AnalysisSchema BEFORE it is
// returned (and therefore before anything is written to the database). When no
// key is configured, or the call/validation fails, a deterministic mock is used.
// ---------------------------------------------------------------------------

export type { AnalyzerInput };
export interface AnalysisResult {
  analysis: Analysis;
  analyzer: string; // "gpt-6-astra" | "mock-astra" | "mock-astra (fallback)"
  warning: string | null;
}

const SYSTEM_PROMPT = `You are the intake analyst for a one-person AI creative studio that produces image, video and voice work with generative models.
Turn the client brief into the structured analysis defined by the schema. Be literal and conservative.

Rules:
- deliverables: each needs a format, and aspectRatio/duration/resolution when stated (null when not). exactTextRequirements holds only copy to be rendered or spoken verbatim — copy it character-for-character.
- suppliedAssets vs missingAssets: what the client gave you vs what a producer still needs.
- rightsAndConsentFlags: flag exact logos, packaging text, a real person's likeness or voice, factual/efficacy claims, licensed music, or unclear usage rights. Use kind "impersonation" ONLY for deceptive depiction of a real person (e.g. a fake endorsement) — that is a hard stop.
- proposedWorkflow: describe each production step by the CAPABILITY it needs, chosen ONLY from the allowed capability values. NEVER name a specific model, product or vendor, and NEVER mention prices or costs — pricing is decided by the application, not by you.
- estimatedAttemptsByStep: one integer per proposedWorkflow step (same order) — your honest estimate of generation attempts (selects included) that step will take.
- confidence: 0–100. revisionRisk: low/medium/high.
- decision: your suggestion only (accept / human_review / reject). The application makes the binding decision from catalog prices and margin; do not reason about money.
Never invent client facts.`;

async function analyzeWithAstra(input: AnalyzerInput): Promise<Analysis> {
  const res = await fetch(`${config.openai.baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.1,
      max_output_tokens: 3000,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            source: input.source,
            clientBudgetUsd: input.budget,
            deadline: input.deadline,
            referenceAssets: input.referenceAssets,
            clientNotes: input.clientNotes,
            brief: input.rawBrief,
          }),
        },
      ],
      text: {
        format: { type: "json_schema", name: "brief_analysis", strict: true, schema: toStrictJsonSchema(AnalysisSchema) },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Astra request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return parseAnalysis(parseOutputJson(extractOutputText(body)));
}

export async function analyzeBrief(input: AnalyzerInput): Promise<AnalysisResult> {
  if (!openaiLive()) return { analysis: mockAnalyze(input), analyzer: "mock-astra", warning: null };
  try {
    return { analysis: await analyzeWithAstra(input), analyzer: config.openai.model, warning: null };
  } catch (err) {
    return {
      analysis: mockAnalyze(input),
      analyzer: "mock-astra (fallback)",
      warning: `GPT-6 Astra call failed, used offline analyzer: ${(err as Error).message}`,
    };
  }
}
