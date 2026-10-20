import type { ModelCategory } from "../domain/types";

// ---------------------------------------------------------------------------
// The prompt library: production-ready prompts saved for reuse. A prompt may contain {{variables}}
// that are filled from the job (the creative brief and the analysed brief) when it is inserted into a
// step. Pure module — also used by client components.
// ---------------------------------------------------------------------------

export const PROMPT_CATEGORIES = ["image", "video", "voice", "editing", "finishing"] as const satisfies readonly ModelCategory[];

export interface PromptInput {
  name: string;
  category: ModelCategory;
  modelId: string | null;
  tags: string[];
  body: string;
  notes: string | null;
}

export type PromptValidation = { ok: true; value: PromptInput } | { ok: false; errors: Partial<Record<keyof PromptInput, string>> };

const VAR = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

/** Variables a prompt uses, in order of first appearance, lowercased. */
export function extractVariables(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(VAR)) {
    const v = m[1].toLowerCase();
    if (!seen.includes(v)) seen.push(v);
  }
  return seen;
}

/** The variables the app can fill from a job. Anything else stays as {{name}} for the operator to complete. */
export const KNOWN_VARIABLES = ["brief", "logline", "audience", "tone", "visual_direction", "key_messages", "must_haves", "avoid", "format"] as const;
export type PromptContext = Partial<Record<(typeof KNOWN_VARIABLES)[number], string>>;

/** Fill known variables; unknown or empty ones are left in place so nothing is silently dropped. */
export function renderPrompt(body: string, ctx: PromptContext): string {
  return body.replace(VAR, (whole, name: string) => {
    const v = (ctx as Record<string, string | undefined>)[name.toLowerCase()];
    return v && v.trim() ? v.trim() : whole;
  });
}

/** Variables still unresolved after rendering. */
export const unresolvedVariables = (rendered: string) => extractVariables(rendered);

/**
 * A take's prompt as sent to the model, without the trailing "Take N." / "Retry…" bookkeeping so that the
 * saved prompt does not carry one take's number into the next job.
 */
export function cleanTakePrompt(prompt: string): string {
  return prompt
    .split("\n")
    .filter((l) => !/^Take \d+\.$/.test(l.trim()))
    .join("\n")
    .trim();
}

export function parseTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const x of raw) {
    const t = String(x).toLowerCase().replace(/[^a-z0-9æøå _-]+/g, "").trim().replace(/\s+/g, "-");
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 8);
}

export function validatePrompt(input: { name?: unknown; category?: unknown; modelId?: unknown; tags?: unknown; body?: unknown; notes?: unknown }): PromptValidation {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = text(input.name).replace(/\s+/g, " ");
  const body = text(input.body);
  const category = PROMPT_CATEGORIES.find((c) => c === input.category);
  const notes = text(input.notes);
  const errors: Partial<Record<keyof PromptInput, string>> = {};
  if (!name) errors.name = "Give the prompt a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!category) errors.category = "Pick what kind of step this prompt is for.";
  if (!body) errors.body = "The prompt text is empty.";
  else if (body.length > 4000) errors.body = "Keep the prompt under 4,000 characters.";
  if (notes.length > 500) errors.notes = "Keep the notes under 500 characters.";
  if (Object.keys(errors).length || !category) return { ok: false, errors };
  return { ok: true, value: { name, category, modelId: text(input.modelId) || null, tags: parseTags(input.tags), body, notes: notes || null } };
}
