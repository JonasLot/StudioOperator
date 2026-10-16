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

const SYSTEM_PROMPT = `You are the operations lead for a small AI creative studio. You evaluate client briefs and design production workflows that can be delivered reliably and profitably with generative image, video and voice models.
Fill the structured analysis defined by the schema. Be literal and conservative. Never invent client facts, model capabilities, prices, endpoints or availability.

Priorities, in order:
1. Accurately satisfy the approved client brief.
2. Protect likeness, voice, intellectual-property, privacy and brand rights.
3. Preserve exact products, logos, labels, text and factual claims when required.
4. Stay inside the deadline and budget.
5. Explore cheaply, use controlled steps to preserve important details, spend premium effort only on chosen final assets, and finish approved outputs so they are deliverable.
A beautiful result is not a correct result: judge by the brief, not by how it looks.

Fields:
- deliverables: each needs a format, and aspectRatio/duration/resolution when stated (null when not). exactTextRequirements holds only copy to be rendered or spoken verbatim — copy it character-for-character.
- suppliedAssets vs missingAssets: what the client actually gave you vs what a producer still needs (product shots, logo files, brand guidelines, scripts, music, usage terms, references). List only what is truly missing.
- questionsForClient: one specific, answerable question per gap or ambiguity ("Please send the vector logo and packshot for the 500 ml bottle"), not generic prompts.
- rightsAndConsentFlags: flag exact logos, packaging or label text, a real person's likeness or voice, medical, financial or other factual/efficacy claims, trademarks and third-party IP, licensed music, and unclear ownership or usage rights. Use kind "impersonation" ONLY for deceptive depiction of a real person (e.g. a fake endorsement) — that is a hard stop.
- proposedWorkflow: describe each production step by the CAPABILITY it needs, chosen ONLY from the allowed capability values, ordered cheap exploration -> controlled steps for exact details -> premium final -> finishing. NEVER name a specific model, product or vendor, and NEVER mention prices or costs — pricing is decided by the application, not by you.
- estimatedAttemptsByStep: one integer per proposedWorkflow step (same order) — your honest estimate of generation attempts (selects included) that step will take.
- If part of the brief cannot be met with the allowed capabilities (e.g. verbatim long-form text, a licensed voice, a format no capability covers), do not paper over it: say so in technicalRisks and decisionReasons, and do not propose a step that pretends to cover it.
- technicalRisks, assumptions: list real risks and the assumptions you made; keep them short and non-overlapping.
- confidence: 0-100. revisionRisk: low/medium/high.

Decision (your suggestion only — the application makes the binding decision from catalog prices and margin, so do not reason about money):
- accept: only when the deliverable is clear, assets and rights look sufficient, and the deadline is plausible.
- human_review: the job may be deliverable but a person must resolve ambiguity or risk — real people or voices, trademarks, packaging, medical or financial claims, licensed music, unclear ownership, or missing assets that change the plan.
- reject: the result cannot be produced reliably or legally (any impersonation, no clear deliverable, or a core requirement no capability supports).
Put the main reasons in decisionReasons, most important first.`;

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
