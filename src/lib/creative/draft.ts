import "server-only";
import { config, draftLive, scrubSecrets } from "@/lib/config";
import { coerceBrief, type CreativeBrief } from "./brief";
import { extractChatText, extractModelIds, isModelNotFound, parseJsonLoose } from "./chat";
import { mockDraft, type DraftInput } from "./mock";

// ---------------------------------------------------------------------------
// First-phase AI: drafts the creative brief from the client's brief. It talks to any OpenAI-compatible
// /chat/completions endpoint, so it can be a local model (Ollama, LM Studio) or a very cheap hosted one.
// Its output is coerced into the brief shape before anything is stored; when no endpoint is configured,
// or the call fails, a deterministic offline drafter is used so the flow always works.
// ---------------------------------------------------------------------------

export interface DraftResult {
  brief: CreativeBrief;
  drafter: string; // the model name, "mock-draft" or "mock-draft (fallback)"
  warning: string | null;
}

const SYSTEM_PROMPT = `You write the first draft of a creative brief for a small AI creative studio. Read the client's brief and turn it into a short, concrete creative direction that a producer can hand to image, video and voice models.
Rules:
- Use only what the client wrote. Never invent client facts, product details, claims, names or numbers. If something important is missing, put it in openQuestions as a specific question.
- Keep every field short. Copy exact text, names and claims character-for-character.
- Do not name models, tools or prices.
Answer with a single JSON object and nothing else, with exactly these keys:
{"logline": string, "audience": string, "tone": string, "visualDirection": string, "keyMessages": string[], "mustHaves": string[], "avoid": string[], "openQuestions": string[]}
logline: one sentence, what the piece is and why it exists. tone: a few words. visualDirection: palette, light, camera, texture. keyMessages: up to 3. mustHaves and avoid: concrete elements to include / keep out.`;

export async function chatRequest(body: Record<string, unknown>) {
  const key = config.draft.apiKey;
  return fetch(`${config.draft.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(180_000), // a local model can be slow on first load (and reasoning models think first)
  });
}

/** The models an OpenAI-compatible endpoint offers (GET /models). Throws with a readable reason. */
export async function listEndpointModels(baseUrl: string, apiKey: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") throw new Error("The endpoint did not answer within 8 seconds.");
    if (e.cause?.code === "ECONNREFUSED") throw new Error("Nothing is listening there. Is Ollama / LM Studio running?");
    throw new Error(`Could not reach the endpoint: ${scrubSecrets(e.message)}`);
  }
  if (!res.ok) throw new Error(`The endpoint answered ${res.status} to GET /models.`);
  return extractModelIds(await res.json());
}

/** Turn a "model not found" 404 into a message that names what is installed. */
async function explainFailure(status: number, body: string): Promise<string> {
  if (!isModelNotFound(status, body)) return `request failed (${status}): ${body.slice(0, 200)}`;
  let installed: string[] = [];
  try {
    installed = await listEndpointModels(config.draft.baseUrl, config.draft.apiKey);
  } catch {
    /* name what we can */
  }
  return `the model “${config.draft.model}” is not installed at ${config.draft.baseUrl}.${installed.length ? ` Available: ${installed.join(", ")}. Pick one under Settings → First-phase AI.` : " Pull it first (ollama pull …) or pick another under Settings → First-phase AI."}`;
}

export async function failureReason(res: Response): Promise<string> {
  return explainFailure(res.status, await res.text());
}

async function draftWithModel(input: DraftInput): Promise<CreativeBrief> {
  const body = {
    model: config.draft.model,
    temperature: 0.3,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ title: input.title, brief: input.rawBrief, clientNotes: input.clientNotes }) },
    ],
  };
  // Ask for JSON mode, but retry plainly if the endpoint rejects the parameter.
  let res = await chatRequest({ ...body, response_format: { type: "json_object" } });
  if (res.status === 400) res = await chatRequest(body);
  if (!res.ok) throw new Error(await failureReason(res));
  const brief = coerceBrief(parseJsonLoose(extractChatText(await res.json())));
  if (!brief) throw new Error("the answer had no logline");
  return brief;
}

export async function draftCreativeBrief(input: DraftInput): Promise<DraftResult> {
  if (!draftLive()) return { brief: mockDraft(input), drafter: "mock-draft", warning: null };
  try {
    return { brief: await draftWithModel(input), drafter: config.draft.model, warning: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out after 3 minutes" : scrubSecrets((err as Error).message);
    return { brief: mockDraft(input), drafter: "mock-draft (fallback)", warning: `${config.draft.model} could not draft, used the offline drafter: ${reason}` };
  }
}
