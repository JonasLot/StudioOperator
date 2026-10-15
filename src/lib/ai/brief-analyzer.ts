import "server-only";
import { z } from "zod";
import { astraLive, config } from "@/lib/config";
import type { Decision, Deliverable, DeliverableKind, JobSource } from "@/lib/domain/types";

export interface BriefInput {
  rawBrief: string;
  budget: number;
  deadline: string;
  source: JobSource;
  referenceAssets: string[];
  clientNotes: string | null;
}

export interface AnalysisDraft {
  analyzer: string;
  summary: string;
  deliverables: Deliverable[];
  dimensions: string[];
  durations: string[];
  references: string[];
  exactText: string[];
  brandConstraints: string[];
  rightsConcerns: string[];
  missingInformation: string[];
  confidence: number;
  suggestedDecision: Decision;
  rationale: string[];
  estimatedShots: number;
  hardStop: string | null; // content we will not produce regardless of economics
}

const DraftSchema = z.object({
  summary: z.string(),
  deliverables: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["film", "cutdown", "still", "voiceover", "social"]),
      title: z.string(),
      quantity: z.number().int().min(1),
      durationSec: z.number().nullable(),
      aspectRatio: z.string().nullable(),
      resolution: z.string().nullable(),
    }),
  ),
  dimensions: z.array(z.string()),
  durations: z.array(z.string()),
  references: z.array(z.string()),
  exactText: z.array(z.string()),
  brandConstraints: z.array(z.string()),
  rightsConcerns: z.array(z.string()),
  missingInformation: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  suggestedDecision: z.enum(["accept", "review", "reject"]),
  rationale: z.array(z.string()),
  estimatedShots: z.number().int().min(0),
  hardStop: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Live: GPT-6 Astra via an OpenAI-compatible chat completions endpoint with JSON-schema output.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the intake analyst for a one-person AI creative studio that produces image, video and voice work with generative models.
Turn the client brief into structured production requirements. Be literal and conservative:
- exactText: only text the client wants rendered verbatim (taglines, supers, end cards). Copy it character-for-character.
- rightsConcerns: likeness of real people, named artists' styles, trademarks/IP, licensed music, voice cloning, unclear usage rights.
- missingInformation: anything a producer must ask before quoting with confidence.
- hardStop: set only for work the studio must not do (non-consensual likeness, deceptive political content, sexual content involving minors, etc.). Otherwise null.
- suggestedDecision: "accept" when clear and feasible, "review" when anything needs a human, "reject" only with a hardStop or an impossible ask.
Deliverable ids are D1, D2, ... Durations in seconds. Never invent client facts.`;

async function analyzeWithAstra(input: BriefInput): Promise<AnalysisDraft> {
  const res = await fetch(`${config.astra.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.astra.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.astra.model,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: { name: "brief_analysis", strict: true, schema: z.toJSONSchema(DraftSchema) },
      },
      messages: [
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
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Astra request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = DraftSchema.parse(JSON.parse(body.choices[0].message.content));
  return { analyzer: config.astra.model, ...parsed };
}

// ---------------------------------------------------------------------------
// Mock: deterministic heuristic analyzer. Good enough to exercise the full flow offline.
// ---------------------------------------------------------------------------

const RIGHTS_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/in the (?:visual )?style of ([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*)/, (m) => `Style reference to a named creator ("${m[1]}") — avoid imitating a living artist's signature style; describe the look instead.`],
  [/\b(celebrity|look-?alike|likeness of|famous actor|real person)\b/i, () => "Possible real-person likeness — need written consent or a fully synthetic character."],
  [/\b(sound(?:s)? like|voice clone|clone (?:the|his|her) voice)\b/i, () => "Voice resembling a specific person — requires consent; use a stock synthetic voice."],
  [/\b(licensed track|song by|use the song|their hit|copyrighted music|popular song)\b/i, () => "Music licensing — client must supply cleared music or accept a library/original bed."],
  [/\b(Disney|Pixar|Marvel|Ghibli|Nike|Apple|Coca-?Cola|Star Wars|Pok[eé]mon)\b/, (m) => `Third-party IP mentioned ("${m[1]}") — confirm it is reference-only and not reproduced.`],
  [/\b(no (?:usage|license|licence) (?:terms|info)|usage rights unclear|perpetual|buyout|all media)\b/i, (m) => `Usage terms ("${m[1]}") — confirm scope, territory and term before quoting.`],
];

const HARD_STOP_PATTERNS: [RegExp, string][] = [
  [/\b(deepfake|make it look like (?:the )?(?:president|senator|minister)|fake (?:news|endorsement))\b/i, "Deceptive depiction of a real person — the studio does not produce this."],
  [/\b(without (?:their|his|her) (?:consent|permission))\b/i, "Work involving a real person without consent — the studio does not produce this."],
];

function uniq<T>(xs: T[]) {
  return [...new Set(xs)];
}

function sentences(text: string) {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 3);
}

function mockAnalyze(input: BriefInput): AnalysisDraft {
  const text = `${input.rawBrief}\n${input.clientNotes ?? ""}`;
  const lower = text.toLowerCase();

  const exactText = uniq(
    [...text.matchAll(/[“"]([^”"\n]{2,140})[”"]/g)].map((m) => m[1].trim()).filter((s) => s.split(" ").length <= 20 && (s.includes(" ") || /[.!?:]$/.test(s))), // single bare words are usually names, not copy
  );

  const durationSecs: number[] = [];
  for (const m of text.matchAll(/(\d{1,3})\s*[- ]?(?:s|sec|secs|second|seconds)\b/gi)) durationSecs.push(Number(m[1]));
  for (const m of text.matchAll(/(\d{1,2})\s*[- ]?(?:min|mins|minute|minutes)\b/gi)) durationSecs.push(Number(m[1]) * 60);
  const durs = uniq(durationSecs).filter((d) => d >= 3 && d <= 600).sort((a, b) => b - a);

  const aspects = uniq([...text.matchAll(/\b(16:9|9:16|1:1|4:5|2\.39:1|21:9|4:3)\b/g)].map((m) => m[1]));
  const resolutions = uniq([...text.matchAll(/\b(4K|8K|1080p|720p|\d{3,4}\s?[x×]\s?\d{3,4})\b/gi)].map((m) => m[1].toUpperCase()));

  const urls = [...text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0].replace(/[).,]+$/, ""));
  const refSentences = sentences(input.rawBrief).filter((s) => /\b(reference|inspired by|mood|look of|feel of|vibe|like the)\b/i.test(s));
  const references = uniq([...input.referenceAssets, ...urls, ...refSentences]).slice(0, 10);

  const brandConstraints = uniq(
    sentences(text).filter((s) =>
      /\b(brand|logo|palette|colou?rs?|font|typeface|tone|avoid|do not|don't|must|never|guidelines?|no text|no people)\b/i.test(s),
    ),
  ).slice(0, 8);

  const rightsConcerns: string[] = [];
  for (const [re, fmt] of RIGHTS_PATTERNS) {
    const m = text.match(re);
    if (m) rightsConcerns.push(fmt(m));
  }
  let hardStop: string | null = null;
  for (const [re, msg] of HARD_STOP_PATTERNS) if (re.test(text)) hardStop = msg;

  // deliverables
  const deliverables: Deliverable[] = [];
  let n = 1;
  const nextId = () => `D${n++}`;
  const wantsVideo = /\b(film|video|spot|commercial|reel|ad|trailer|teaser|cutdown|clip|animation|motion)\b/i.test(text);
  const cutdownAspect = aspects.find((a) => a === "9:16" || a === "4:5" || a === "1:1") ?? null;
  const heroAspect = aspects.find((a) => a !== cutdownAspect) ?? aspects[0] ?? null;
  const res = resolutions[0] ?? null;

  if (wantsVideo && durs.length > 0) {
    const [main, ...rest] = durs;
    const kind: DeliverableKind = main >= 30 ? "film" : "social";
    deliverables.push({
      id: nextId(),
      kind,
      title: kind === "film" ? `${main}s hero film` : `${main}s social spot`,
      quantity: 1,
      durationSec: main,
      aspectRatio: heroAspect,
      resolution: res,
    });
    for (const d of rest.slice(0, 3)) {
      const countMatch = text.match(new RegExp(`(\\d|two|three|four)\\s*(?:x\\s*)?${d}\\s*[- ]?s`, "i"));
      const words: Record<string, number> = { two: 2, three: 3, four: 4 };
      const qty = countMatch ? (Number(countMatch[1]) || words[countMatch[1].toLowerCase()] || 1) : 1;
      deliverables.push({
        id: nextId(),
        kind: "cutdown",
        title: `${d}s cutdown${qty > 1 ? "s" : ""}`,
        quantity: qty,
        durationSec: d,
        aspectRatio: cutdownAspect ?? heroAspect,
        resolution: res,
      });
    }
  } else if (wantsVideo) {
    deliverables.push({ id: nextId(), kind: "social", title: "Short video (duration TBC)", quantity: 1, durationSec: 15, aspectRatio: heroAspect, resolution: res });
  }

  const stillMatch = text.match(/(\d{1,2}|one|two|three|four|five|six|eight|ten|twelve)\s+(?:[\w-]+\s+){0,2}(stills|key ?visuals|images|posters|thumbnails|banners|frames)\b/i);
  if (stillMatch) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
    const qty = Number(stillMatch[1]) || words[stillMatch[1].toLowerCase()] || 1;
    const noun = stillMatch[2].toLowerCase().replace(/^key ?visuals$/, "key visuals");
    deliverables.push({ id: nextId(), kind: "still", title: noun.charAt(0).toUpperCase() + noun.slice(1), quantity: qty, durationSec: null, aspectRatio: aspects.find((a) => a === "4:5" || a === "1:1") ?? heroAspect, resolution: res });
  }
  const wantsVO = /\b(voice[- ]?over|voiceover|\bvo\b|narrat\w+)\b/i.test(text);
  if (wantsVO && !/\bno (voice[- ]?over|vo|narration)\b/i.test(text)) {
    deliverables.push({ id: nextId(), kind: "voiceover", title: "Voiceover", quantity: 1, durationSec: durs[0] ?? null, aspectRatio: null, resolution: null });
  }

  // missing information
  const missing: string[] = [];
  if (deliverables.length === 0) missing.push("No clear deliverable — what exactly should be produced?");
  if (wantsVideo && durs.length === 0) missing.push("Video duration is not specified.");
  if (aspects.length === 0 && resolutions.length === 0) missing.push("Aspect ratio / delivery resolution not specified.");
  if (!/\b(brand|guidelines?|logo|palette)\b/i.test(text)) missing.push("No brand guidelines or logo files referenced.");
  if (wantsVideo && !/\b(music|score|sound|audio|sfx)\b/i.test(lower)) missing.push("Music / sound direction not specified.");
  if (!/\b(usage|licen[cs]e|rights|paid social|broadcast|organic|territor)\b/i.test(lower)) missing.push("Usage scope (channels, territory, term) not stated.");
  if (references.length === 0) missing.push("No visual references provided.");
  if (/\brevisions?\b/i.test(lower) === false) missing.push("Number of included revision rounds not agreed.");

  const shotEstimate = deliverables.reduce((acc, d) => {
    if (d.kind === "film") return acc + Math.ceil((d.durationSec ?? 30) / 4);
    if (d.kind === "social") return acc + Math.ceil((d.durationSec ?? 15) / 3.5);
    if (d.kind === "cutdown") return acc + Math.ceil(((d.durationSec ?? 15) / 3.5) * 0.4) * d.quantity;
    return acc;
  }, 0);

  const confidence = Math.max(0.35, Math.min(0.95, 0.93 - missing.length * 0.06 - rightsConcerns.length * 0.04));

  const rationale: string[] = [];
  let suggested: Decision = "accept";
  if (hardStop) {
    suggested = "reject";
    rationale.push(hardStop);
  } else {
    if (rightsConcerns.length) {
      suggested = "review";
      rationale.push(`${rightsConcerns.length} rights concern${rightsConcerns.length > 1 ? "s" : ""} must be cleared by a human before production.`);
    }
    if (missing.length >= 4) {
      suggested = "review";
      rationale.push(`${missing.length} open questions — clarify with the client before committing.`);
    }
    if (suggested === "accept") rationale.push("Brief is specific enough to plan and quote.");
  }

  const firstLine = sentences(input.rawBrief)[0] ?? "Untitled brief";
  const summary =
    deliverables.length > 0
      ? `${firstLine.slice(0, 140)} — ${deliverables.map((d) => (d.quantity > 1 ? `${d.quantity}× ` : "") + d.title).join(", ")}.`
      : firstLine.slice(0, 200);

  return {
    analyzer: "mock-astra",
    summary,
    deliverables,
    dimensions: uniq([...aspects, ...resolutions]),
    durations: durs.map((d) => (d >= 60 && d % 60 === 0 ? `${d / 60} min` : `${d}s`)),
    references,
    exactText,
    brandConstraints,
    rightsConcerns,
    missingInformation: missing,
    confidence: Math.round(confidence * 100) / 100,
    suggestedDecision: suggested,
    rationale,
    estimatedShots: shotEstimate,
    hardStop,
  };
}

export async function analyzeBrief(input: BriefInput): Promise<{ draft: AnalysisDraft; warning: string | null }> {
  if (!astraLive()) return { draft: mockAnalyze(input), warning: null };
  try {
    return { draft: await analyzeWithAstra(input), warning: null };
  } catch (err) {
    return {
      draft: { ...mockAnalyze(input), analyzer: "mock-astra (fallback)" },
      warning: `GPT-6 Astra call failed, used offline analyzer: ${(err as Error).message}`,
    };
  }
}
