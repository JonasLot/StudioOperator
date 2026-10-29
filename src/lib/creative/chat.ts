// Pure helpers for OpenAI-compatible chat completions (Ollama, LM Studio, OpenRouter, OpenAI itself).

/** The assistant text from a /chat/completions body. */
export function extractChatText(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error) throw new Error(`The model returned an error: ${typeof b.error === "string" ? b.error : JSON.stringify(b.error).slice(0, 200)}`);
    const choice = Array.isArray(b.choices) ? (b.choices[0] as Record<string, unknown> | undefined) : undefined;
    const content = (choice?.message as Record<string, unknown> | undefined)?.content;
    if (typeof content === "string") {
      const answer = stripThinking(content);
      if (answer) return answer;
    }
  }
  throw new Error("Malformed response: no message content found.");
}

/**
 * Reasoning models (qwen3.5, deepseek-r1, gpt-oss behind some servers) may put their thinking inline as
 * <think>…</think> before the answer. Only the answer is wanted; an unclosed block means it never got there.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*$/i, "")
    .trim();
}

/** Model ids from an OpenAI-compatible GET /models body ({ data: [{ id }] }), sorted. */
export function extractModelIds(body: unknown): string[] {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  const ids = data.map((m) => (m && typeof m === "object" ? (m as { id?: unknown }).id : undefined)).filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** A 404 whose body says the model does not exist (Ollama, LM Studio, OpenAI all phrase it this way). */
export function isModelNotFound(status: number, body: string): boolean {
  return status === 404 && /model[\s\S]*not found|does not exist|no such model/i.test(body);
}

/**
 * Parse JSON that a small model may have wrapped in a code fence or a sentence. Takes the outermost
 * {...} when plain parsing fails.
 */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("The model's answer was not valid JSON.");
  }
}
