import { z } from "zod";

// ---------------------------------------------------------------------------
// The creative brief: a short, structured statement of the creative direction for a job. A cheap
// first-phase model drafts it from the client's brief, Astra sharpens it with the operator, and once
// it is locked it is appended to every step prompt as "Creative direction".
// Pure module — safe to import from tests and from client components.
// ---------------------------------------------------------------------------

export const CreativeBriefSchema = z.object({
  logline: z.string().describe("One sentence: what the piece is and why it exists"),
  audience: z.string().describe("Who it is for"),
  tone: z.string().describe("Mood and voice in a few words"),
  visualDirection: z.string().describe("Look and feel: palette, light, camera, texture, references"),
  keyMessages: z.array(z.string()).describe("What the viewer must take away"),
  mustHaves: z.array(z.string()).describe("Elements that have to be in the result"),
  avoid: z.array(z.string()).describe("Things to keep out of the result"),
  openQuestions: z.array(z.string()).describe("Gaps the operator or client still has to settle"),
});
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export const EMPTY_BRIEF: CreativeBrief = {
  logline: "",
  audience: "",
  tone: "",
  visualDirection: "",
  keyMessages: [],
  mustHaves: [],
  avoid: [],
  openQuestions: [],
};

export type BriefStatus = "draft" | "locked";

export interface BriefMessage {
  role: "operator" | "astra" | "system"; // system = a note from the app, e.g. the drafter fell back to offline
  content: string;
  at: string;
}

export const LIST_FIELDS = ["keyMessages", "mustHaves", "avoid", "openQuestions"] as const satisfies readonly (keyof CreativeBrief)[];
export const TEXT_FIELDS = ["logline", "audience", "tone", "visualDirection"] as const satisfies readonly (keyof CreativeBrief)[];

const MAX_TEXT = 600;
const MAX_ITEM = 240;
const MAX_ITEMS = 8;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

function listOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  const out: string[] = [];
  for (const x of raw) {
    const t = clip(oneLine(typeof x === "string" ? x.replace(/^[-•*]\s*/, "") : x), MAX_ITEM);
    if (t && !out.some((y) => y.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, MAX_ITEMS);
}

/**
 * Turn whatever a model (or the edit form) produced into a well-formed brief: trimmed, de-duplicated and
 * length-limited. Small local models often skip fields or return a string where a list belongs, so this is
 * deliberately forgiving. Returns null when there is no logline, because without it there is no brief.
 */
export function coerceBrief(raw: unknown): CreativeBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const brief: CreativeBrief = {
    logline: clip(oneLine(r.logline), MAX_TEXT),
    audience: clip(oneLine(r.audience), MAX_TEXT),
    tone: clip(oneLine(r.tone), MAX_TEXT),
    visualDirection: clip(oneLine(r.visualDirection ?? r.visual_direction), MAX_TEXT),
    keyMessages: listOf(r.keyMessages ?? r.key_messages),
    mustHaves: listOf(r.mustHaves ?? r.must_haves),
    avoid: listOf(r.avoid),
    openQuestions: listOf(r.openQuestions ?? r.open_questions),
  };
  return brief.logline ? brief : null;
}

/** Which fields differ between two briefs, for "Astra changed: …" in the thread. */
export function changedFields(a: CreativeBrief, b: CreativeBrief): (keyof CreativeBrief)[] {
  return (Object.keys(EMPTY_BRIEF) as (keyof CreativeBrief)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export const FIELD_LABEL: Record<keyof CreativeBrief, string> = {
  logline: "Logline",
  audience: "Audience",
  tone: "Tone",
  visualDirection: "Visual direction",
  keyMessages: "Key messages",
  mustHaves: "Must-haves",
  avoid: "Avoid",
  openQuestions: "Open questions",
};

/**
 * The compact block appended to step prompts once the brief is locked. Open questions are left out: they
 * are for the operator, not the model.
 */
export function creativeDirectionText(b: CreativeBrief): string {
  const parts = [
    b.logline && `Creative direction: ${b.logline}`,
    b.tone && `Tone: ${b.tone}`,
    b.visualDirection && `Look: ${b.visualDirection}`,
    b.audience && `Audience: ${b.audience}`,
    b.mustHaves.length && `Must include: ${b.mustHaves.join("; ")}`,
    b.avoid.length && `Avoid: ${b.avoid.join("; ")}`,
  ];
  return parts.filter(Boolean).join("\n");
}
