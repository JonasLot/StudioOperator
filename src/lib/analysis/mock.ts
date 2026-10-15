import type { Analysis, AnalysisDeliverable, Capability, ConsentFlag } from "./schema";

// ---------------------------------------------------------------------------
// Deterministic offline analyzer.
//
// Produces a realistic structured analysis in the exact schema without any API
// call, so the whole intake flow works with no OPENAI_API_KEY. It only extracts
// and estimates; it never prices anything (that is the cost calculator's job).
// Pure module — safe to import from tests.
// ---------------------------------------------------------------------------

export interface AnalyzerInput {
  rawBrief: string;
  budget: number;
  deadline: string;
  source: string;
  referenceAssets: string[];
  clientNotes: string | null;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function sentences(text: string) {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 3);
}

const CONSENT_PATTERNS: [RegExp, ConsentFlag["kind"], string][] = [
  [/\b(deepfake|fake (?:news|endorsement)|impersonat\w+|make it look like (?:the )?(?:president|senator|minister|a real)|without (?:their|his|her) (?:consent|permission))\b/i, "impersonation", "Deceptive depiction of a real person without consent."],
  [/\b(celebrity|look-?alike|likeness of|famous actor|real person|spokesperson|the president)\b/i, "person_likeness", "A real person's likeness may be involved — written consent or a fully synthetic character is required."],
  [/\b(voice clone|sound(?:s)? like|clone (?:the|his|her) voice|impersonate (?:the|his|her) voice)\b/i, "person_voice", "A specific person's voice may be involved — consent required, or use a stock synthetic voice."],
  [/\b(licensed track|song by|use the song|their hit|copyrighted music|popular song|hit song)\b/i, "licensed_music", "Music licensing — the client must supply cleared music or accept a library/original bed."],
  [/\b(logo|wordmark)\b/i, "logo", "Exact logo/wordmark usage — confirm brand assets and placement rules."],
  [/\b(packaging|pack shot|label text|on-?pack)\b/i, "packaging_text", "Packaging/label text must be reproduced exactly — confirm artwork."],
  [/\b(clinically|proven|guaranteed|#1|number one|cures?|studies show|scientifically)\b/i, "factual_claim", "Factual/efficacy claim — must be substantiated and legally cleared."],
];

function detectDeliverables(text: string, exactText: string[]): { deliverables: AnalysisDeliverable[]; heroShots: number } {
  const durationSecs: number[] = [];
  for (const m of text.matchAll(/(\d{1,3})\s*[- ]?(?:s|sec|secs|second|seconds)\b/gi)) durationSecs.push(Number(m[1]));
  for (const m of text.matchAll(/(\d{1,2})\s*[- ]?(?:min|mins|minute|minutes)\b/gi)) durationSecs.push(Number(m[1]) * 60);
  const durs = uniq(durationSecs).filter((d) => d >= 3 && d <= 600).sort((a, b) => b - a);
  const aspects = uniq([...text.matchAll(/\b(16:9|9:16|1:1|4:5|2\.39:1|21:9|4:3)\b/g)].map((m) => m[1]));
  const resolutions = uniq([...text.matchAll(/\b(4K|8K|1080p|720p|\d{3,4}\s?[x×]\s?\d{3,4})\b/gi)].map((m) => m[1].toUpperCase()));
  const res = resolutions[0] ?? null;
  const cutdownAspect = aspects.find((a) => a === "9:16" || a === "4:5" || a === "1:1") ?? null;
  const heroAspect = aspects.find((a) => a !== cutdownAspect) ?? aspects[0] ?? null;

  const deliverables: AnalysisDeliverable[] = [];
  const wantsVideo = /\b(film|video|spot|commercial|reel|ad|trailer|teaser|cutdown|clip|animation|motion)\b/i.test(text);
  const durText = (d: number) => (d >= 60 && d % 60 === 0 ? `${d / 60} min` : `${d}s`);
  let heroShots = 0;

  if (wantsVideo && durs.length) {
    const [main, ...rest] = durs;
    deliverables.push({
      name: main >= 30 ? "Hero film" : "Social spot",
      format: "video",
      aspectRatio: heroAspect,
      duration: durText(main),
      resolution: res,
      exactTextRequirements: exactText,
    });
    heroShots = Math.ceil(main / 4);
    for (const d of rest.slice(0, 3)) {
      deliverables.push({ name: `${durText(d)} cutdown`, format: "video", aspectRatio: cutdownAspect ?? heroAspect, duration: durText(d), resolution: res, exactTextRequirements: [] });
    }
  } else if (wantsVideo) {
    deliverables.push({ name: "Short video (duration TBC)", format: "video", aspectRatio: heroAspect, duration: null, resolution: res, exactTextRequirements: exactText });
    heroShots = 4;
  }

  const stillMatch = text.match(/(\d{1,2}|one|two|three|four|five|six|eight|ten|twelve)\s+(?:[\w-]+\s+){0,2}(stills|key ?visuals|images|posters|thumbnails|banners|frames)\b/i);
  if (stillMatch) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
    const qty = Number(stillMatch[1]) || words[stillMatch[1].toLowerCase()] || 1;
    deliverables.push({ name: `${qty} × ${stillMatch[2].toLowerCase()}`, format: "still image", aspectRatio: aspects.find((a) => a === "4:5" || a === "1:1") ?? heroAspect, duration: null, resolution: res, exactTextRequirements: [] });
  }

  if (/\b(voice[- ]?over|voiceover|\bvo\b|narrat\w+)\b/i.test(text) && !/\bno (voice[- ]?over|vo|narration)\b/i.test(text)) {
    deliverables.push({ name: "Voiceover", format: "voiceover", aspectRatio: null, duration: durs[0] ? durText(durs[0]) : null, resolution: null, exactTextRequirements: exactText });
  }

  return { deliverables, heroShots };
}

export function mockAnalyze(input: AnalyzerInput): Analysis {
  const text = `${input.rawBrief}\n${input.clientNotes ?? ""}`;
  const lower = text.toLowerCase();

  const exactText = uniq(
    [...text.matchAll(/[“"]([^”"\n]{2,140})[”"]/g)].map((m) => m[1].trim()).filter((s) => s.split(" ").length <= 20 && (s.includes(" ") || /[.!?:]$/.test(s))),
  );

  const flags: ConsentFlag[] = [];
  for (const [re, kind, detail] of CONSENT_PATTERNS) {
    const m = text.match(re);
    if (m) flags.push({ kind, detail });
  }
  // keep one flag per kind
  const seen = new Set<string>();
  const rightsAndConsentFlags = flags.filter((f) => (seen.has(f.kind) ? false : (seen.add(f.kind), true)));

  const { deliverables, heroShots } = detectDeliverables(text, exactText);

  const urls = [...text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0].replace(/[).,]+$/, ""));
  const suppliedAssets = uniq([...input.referenceAssets, ...urls]);

  const missingAssets: string[] = [];
  if (!/\b(brand|guidelines?|logo|palette)\b/i.test(text)) missingAssets.push("Brand guidelines / logo files");
  if (suppliedAssets.length === 0) missingAssets.push("Visual references or moodboard");
  if (/\b(film|video|spot|reel|ad)\b/i.test(text) && !/\b(music|score|sound|audio|sfx)\b/i.test(lower)) missingAssets.push("Music / sound direction or files");

  const questionsForClient: string[] = [];
  if (!/\b(usage|licen[cs]e|rights|paid social|broadcast|organic|territor)\b/i.test(lower)) questionsForClient.push("What is the usage scope — channels, territory and term?");
  if (/\brevisions?\b/i.test(lower) === false) questionsForClient.push("How many revision rounds are included?");
  if (/\b(video|film|spot|reel)\b/i.test(lower) && !/\b\d+\s*(?:s|sec|min)/i.test(lower)) questionsForClient.push("What is the exact runtime for each cut?");
  if (deliverables.length === 0) questionsForClient.push("What exactly should be produced, and in what format?");

  const brandConstraints = uniq(
    sentences(text).filter((s) => /\b(brand|logo|palette|colou?rs?|font|typeface|tone|avoid|do not|don't|must|never|guidelines?|no text|no people)\b/i.test(s)),
  ).slice(0, 8);

  const technicalRisks: string[] = [];
  if (exactText.length) technicalRisks.push("On-screen text must read exactly as briefed — generative models drift on spelling and kerning.");
  if (deliverables.some((d) => d.format === "voiceover")) technicalRisks.push("Voiceover must stay in sync with picture timing across cuts.");
  if (deliverables.some((d) => d.format === "video")) technicalRisks.push("Shot-to-shot consistency (character, lighting, product) is hard across generated clips.");
  if (deliverables.some((d) => (d.resolution ?? "").includes("4K"))) technicalRisks.push("4K upscale can soften fine detail; final grade needs a human eye.");

  // Proposed workflow by capability (+ estimated attempts), parallel arrays.
  const proposedWorkflow: { capability: Capability; description: string }[] = [];
  const estimatedAttemptsByStep: number[] = [];
  const add = (capability: Capability, description: string, attempts: number) => {
    proposedWorkflow.push({ capability, description });
    estimatedAttemptsByStep.push(Math.max(1, Math.round(attempts)));
  };

  const video = deliverables.filter((d) => d.format === "video");
  const stills = deliverables.filter((d) => d.format === "still image");
  const renders = Math.max(video.length, 0);
  const keyframes = heroShots + stills.length * 2;
  if (video.length || stills.length) add("image_keyframes", "Lock the visual language — lighting, palette, framing — as approved keyframes.", clamp(keyframes * 3, 4, 60));
  if (exactText.length) add("text_frames", "Render client copy verbatim — supers, taglines and end card.", exactText.length * 3);
  if (video.some((d) => d.name.toLowerCase().includes("hero") || /cinematic|film|anamorphic|35mm/i.test(text)) && heroShots > 0)
    add("hero_video", "Animate approved keyframes into hero shots with deliberate camera moves.", clamp(Math.ceil(heroShots * 2.5), 2, 60));
  if (video.filter((d) => d.name.toLowerCase().includes("cutdown")).length) add("cutdown_video", "Vertical reframes and pickup shots for the social cutdowns.", 6);
  if (deliverables.some((d) => d.format === "voiceover")) add("voiceover", "Narration from the approved script with a stock synthetic voice.", 4);
  if (video.length) {
    add("edit_assemble", "Assemble selects, titles and audio into each deliverable.", Math.max(2, renders * 2));
    add("finishing", "Upscale, grade and export delivery masters.", Math.max(1, renders));
  } else if (stills.length) {
    add("finishing", "Upscale and retouch final stills.", stills.length);
  }

  const impersonation = rightsAndConsentFlags.some((f) => f.kind === "impersonation");
  const confidence = clamp(Math.round(92 - missingAssets.length * 6 - questionsForClient.length * 4 - rightsAndConsentFlags.length * 4), 25, 95);

  const revisionRisk: Analysis["revisionRisk"] = impersonation || exactText.length >= 2 || rightsAndConsentFlags.length >= 2 ? "high" : rightsAndConsentFlags.length || exactText.length ? "medium" : "low";

  const decisionReasons: string[] = [];
  let decision: Analysis["decision"] = "accept";
  if (impersonation) {
    decision = "reject";
    decisionReasons.push("Brief requires deceptive impersonation of a real person.");
  } else if (rightsAndConsentFlags.length || missingAssets.length + questionsForClient.length >= 4) {
    decision = "human_review";
    if (rightsAndConsentFlags.length) decisionReasons.push(`${rightsAndConsentFlags.length} rights/consent flag(s) need a human.`);
    if (missingAssets.length + questionsForClient.length >= 4) decisionReasons.push("Several open questions before this can be quoted with confidence.");
  } else if (deliverables.length === 0) {
    decision = "human_review";
    decisionReasons.push("No clear deliverable extracted.");
  } else {
    decisionReasons.push("Brief is specific enough to plan and quote.");
  }

  const first = sentences(input.rawBrief)[0] ?? "Untitled brief";
  const jobType = video.length && video[0].name.toLowerCase().includes("hero")
    ? "Concept film"
    : video.length
      ? "Social video"
      : stills.length
        ? "Product / key-visual stills"
        : deliverables.length
          ? "Mixed deliverables"
          : "Unclear";

  return {
    jobType,
    conciseSummary: deliverables.length
      ? `${first.slice(0, 140)} — ${deliverables.map((d) => d.name).join(", ")}.`
      : first.slice(0, 200),
    deliverables,
    suppliedAssets,
    missingAssets,
    questionsForClient,
    brandConstraints,
    rightsAndConsentFlags,
    technicalRisks,
    revisionRisk,
    confidence,
    decision,
    decisionReasons,
    proposedWorkflow,
    estimatedAttemptsByStep,
    assumptions: [
      "Music is client-supplied or drawn from a licensed library unless stated otherwise.",
      "Two revision rounds are included unless the brief says otherwise.",
      "Reference material provided is cleared for use.",
    ],
  };
}
