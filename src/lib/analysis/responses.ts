import { z } from "zod";

// ---------------------------------------------------------------------------
// Pure helpers for the OpenAI Responses API shape. Kept out of the server-only
// client so they can be unit-tested directly (malformed / missing output).
// ---------------------------------------------------------------------------

/** Pull the model's text output out of a Responses API body (handles both shapes). */
export function extractOutputText(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error) {
      throw new Error(`Astra returned an error: ${typeof b.error === "string" ? b.error : JSON.stringify(b.error).slice(0, 200)}`);
    }
    if (typeof b.output_text === "string" && b.output_text.trim()) return b.output_text;
    if (Array.isArray(b.output)) {
      const parts: string[] = [];
      for (const item of b.output as Array<Record<string, unknown>>) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const c of content as Array<Record<string, unknown>>) {
            if (c && (c.type === "output_text" || c.type === "text") && typeof c.text === "string") parts.push(c.text);
          }
        }
      }
      if (parts.join("").trim()) return parts.join("");
    }
  }
  throw new Error("Malformed Astra response: no output text found.");
}

/** Parse the model's output text as JSON, with a clear error on failure. */
export function parseOutputJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Astra response was not valid JSON.");
  }
}

// JSON Schema keywords OpenAI's strict Structured Outputs does not accept.
const UNSUPPORTED = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "minLength", "maxLength",
  "pattern", "format", "multipleOf", "default", "$schema",
]);

/**
 * Convert a zod schema to a JSON Schema that satisfies OpenAI strict mode:
 * every object has additionalProperties:false and lists all its keys as
 * required, and unsupported validation keywords are stripped.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (UNSUPPORTED.has(k)) continue;
        // The keys of `properties` / `$defs` are field names, not keywords: a field called "format" must survive.
        out[k] =
          (k === "properties" || k === "$defs") && v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([name, child]) => [name, walk(child)]))
            : walk(v);
      }
      if (out.type === "object" && out.properties && typeof out.properties === "object") {
        out.additionalProperties = false;
        out.required = Object.keys(out.properties as Record<string, unknown>);
      }
      return out;
    }
    return node;
  };
  return walk(z.toJSONSchema(schema)) as Record<string, unknown>;
}
