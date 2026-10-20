// Pure helpers for OpenAI-compatible chat completions (Ollama, LM Studio, OpenRouter, OpenAI itself).

/** The assistant text from a /chat/completions body. */
export function extractChatText(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error) throw new Error(`The model returned an error: ${typeof b.error === "string" ? b.error : JSON.stringify(b.error).slice(0, 200)}`);
    const choice = Array.isArray(b.choices) ? (b.choices[0] as Record<string, unknown> | undefined) : undefined;
    const content = (choice?.message as Record<string, unknown> | undefined)?.content;
    if (typeof content === "string" && content.trim()) return content;
  }
  throw new Error("Malformed response: no message content found.");
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
