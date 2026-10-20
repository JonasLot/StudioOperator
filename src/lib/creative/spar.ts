import "server-only";
import { z } from "zod";
import { config, openaiLive, scrubSecrets } from "@/lib/config";
import { extractOutputText, parseOutputJson, toStrictJsonSchema } from "@/lib/analysis/responses";
import { CreativeBriefSchema, coerceBrief, type BriefMessage, type CreativeBrief } from "./brief";
import { mockSpar, type SparResult } from "./mock";

// ---------------------------------------------------------------------------
// Sparring: Astra reads the draft and the conversation so far, answers the operator and returns the
// whole revised brief (not a diff), so the stored brief is always complete. Uses the same Responses API
// and Structured Outputs as the intake analysis; falls back to the offline stand-in when Astra is not
// available or the call fails.
// ---------------------------------------------------------------------------

export interface SparOutcome extends SparResult {
  astra: string; // "gpt-6-astra" | "mock-astra" | "mock-astra (fallback)"
  warning: string | null;
}

const SparSchema = z.object({
  reply: z.string().describe("A short answer to the operator: what you changed and why, plus at most one question"),
  brief: CreativeBriefSchema,
});

const SYSTEM_PROMPT = `You are the creative director sparring with the operator of a small AI creative studio about the creative brief for one job. A cheaper model wrote the first draft; your job is to make it sharper, more specific and more producible.
Rules:
- The client's brief is the source of truth. Never invent client facts, product details, claims, names or numbers; if something is missing, ask for it in openQuestions rather than filling it in.
- Keep exact text, names and claims character-for-character.
- Prefer concrete, visual, shootable language over adjectives. Remove generic filler. Keep every field short.
- Do not name models, tools, vendors or prices.
- Apply the operator's latest message to the brief. With no message, review the draft yourself: tighten it and surface what is still unclear.
- Return the COMPLETE revised brief, not just the changes. "reply" is 1-3 sentences: what changed and why, and at most one question for the operator.`;

async function sparWithAstra(ctx: { title: string; rawBrief: string; clientNotes: string | null }, brief: CreativeBrief, thread: BriefMessage[], message: string): Promise<SparResult> {
  const res = await fetch(`${config.openai.baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openai.model,
      max_output_tokens: 2000,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            job: ctx,
            currentBrief: brief,
            conversation: thread.slice(-10).map((m) => ({ from: m.role, text: m.content })),
            operatorMessage: message.trim() || null,
          }),
        },
      ],
      text: { format: { type: "json_schema", name: "creative_brief_revision", strict: true, schema: toStrictJsonSchema(SparSchema) } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Astra request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const parsed = parseOutputJson(extractOutputText(await res.json())) as { reply?: unknown; brief?: unknown };
  const revised = coerceBrief(parsed.brief);
  if (!revised) throw new Error("Astra's revision had no logline.");
  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Revised.";
  return { reply, brief: revised };
}

export async function sparOnBrief(ctx: { title: string; rawBrief: string; clientNotes: string | null }, brief: CreativeBrief, thread: BriefMessage[], message: string): Promise<SparOutcome> {
  if (!openaiLive()) return { ...mockSpar(brief, message), astra: "mock-astra", warning: null };
  try {
    return { ...(await sparWithAstra(ctx, brief, thread, message)), astra: config.openai.model, warning: null };
  } catch (err) {
    return { ...mockSpar(brief, message), astra: "mock-astra (fallback)", warning: `GPT-6 Astra call failed, used the offline stand-in: ${scrubSecrets((err as Error).message)}` };
  }
}
