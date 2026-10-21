import { EMPTY_BRIEF, changedFields, coerceBrief, FIELD_LABEL, type CreativeBrief } from "./brief";

// ---------------------------------------------------------------------------
// Deterministic offline drafter and sparring partner. They keep the whole creative-brief flow working with
// no model configured, and they extract rather than invent: every line comes from the client's own words
// or the operator's message. Pure module.
// ---------------------------------------------------------------------------

export interface DraftInput {
  title: string;
  rawBrief: string;
  clientNotes: string | null;
}

const sentences = (text: string) =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 3);

const TONES = ["warm", "premium", "playful", "minimal", "bold", "cinematic", "calm", "energetic", "luxurious", "hopeful", "moody", "elegant", "honest", "quiet"];
const LOOKS = ["macro", "slow motion", "handheld", "golden hour", "low-light", "neon", "monochrome", "studio", "documentary", "orbit", "close-up", "soft light", "high contrast", "pastel"];

const NEGATIVE = /\b(no|not|never|avoid|without|don'?t|do not|must not|shouldn'?t)\b/i;
const REQUIRED = /\b(must|need(?:s)? to|should include|include|required|has to|have to)\b/i;
const AUDIENCE = /\b(?:audience|target|aimed at|for)\b[^.]*$/i;

const pickWords = (text: string, words: string[]) => words.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));

export function mockDraft(input: DraftInput): CreativeBrief {
  const text = [input.rawBrief, input.clientNotes ?? ""].join("\n");
  const all = sentences(text);
  const first = all[0] ?? input.title;
  const rest = all.slice(1);
  const audienceLine = all.find((s) => /\b(audience|target|customers?|viewers?|aimed at)\b/i.test(s));
  const tones = pickWords(text, TONES);
  const looks = pickWords(text, LOOKS);
  const avoid = all.filter((s) => NEGATIVE.test(s));
  const musts = all.filter((s) => REQUIRED.test(s) && !NEGATIVE.test(s));
  const brief: CreativeBrief = {
    ...EMPTY_BRIEF,
    logline: first,
    audience: audienceLine ? (audienceLine.match(AUDIENCE)?.[0] ?? audienceLine) : "",
    tone: tones.join(", "),
    visualDirection: looks.join(", "),
    keyMessages: rest.filter((s) => !avoid.includes(s) && !musts.includes(s)).slice(0, 3),
    mustHaves: musts.slice(0, 4),
    avoid: avoid.slice(0, 4),
    openQuestions: [
      ...(audienceLine ? [] : ["Who is the primary audience?"]),
      ...(tones.length ? [] : ["What tone should it have: three words the client would use?"]),
      ...(looks.length ? [] : ["Are there visual references or a look the client likes?"]),
    ],
  };
  return coerceBrief(brief) ?? { ...EMPTY_BRIEF, logline: input.title };
}

export interface SparResult {
  reply: string;
  brief: CreativeBrief;
}

/** Offline stand-in for Astra: files the operator's note in the most fitting list and says what changed. */
export function mockSpar(current: CreativeBrief, message: string): SparResult {
  const note = message.trim();
  if (!note) {
    const open = current.openQuestions;
    return {
      reply: open.length
        ? `Offline review: ${open.length} open question${open.length === 1 ? "" : "s"} left. Settle “${open[0]}” before locking.`
        : "Offline review: nothing is missing that I can see. Lock it when you are happy.",
      brief: current,
    };
  }
  const next: CreativeBrief = { ...current };
  if (NEGATIVE.test(note)) next.avoid = [...current.avoid, note];
  else if (REQUIRED.test(note)) next.mustHaves = [...current.mustHaves, note];
  else next.keyMessages = [...current.keyMessages, note];
  const brief = coerceBrief(next) ?? current;
  const changed = changedFields(current, brief).map((k) => FIELD_LABEL[k]);
  return {
    reply: changed.length ? `Offline stand-in for Astra: noted in ${changed.join(", ")}. Connect Astra to get real sparring.` : "Offline stand-in for Astra: that is already covered.",
    brief,
  };
}

/** Offline step-prompt suggestion: the step's own prompt followed by the brief's look, exclusions, must-haves, and handoff from earlier steps. */
export function mockStepPrompt(purpose: string, brief: CreativeBrief, prevStep?: { name: string; purpose: string } | null): string {
  const extra = [
    brief.logline,
    brief.visualDirection && `Look: ${brief.visualDirection}`,
    brief.tone && `Tone: ${brief.tone}`,
    brief.mustHaves.length && `Include: ${brief.mustHaves.join(", ")}`,
    brief.avoid.length && `Avoid: ${brief.avoid.join(", ")}`,
    prevStep && `Builds on step “${prevStep.name}”: maintain visual continuity and approved selects.`,
  ].filter(Boolean);
  return [purpose.trim(), ...extra].join("\n");
}
