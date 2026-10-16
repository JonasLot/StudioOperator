import type { Deliverable, DeliverableKind } from "../domain/types";
import type { Analysis, AnalysisDeliverable } from "./schema";

// ---------------------------------------------------------------------------
// Read model derived from the structured Analysis.
//
// The Analysis (effective = human-edited ?? model original) is the single source
// of truth for a brief. Screens, QA and revision planning want a flatter shape
// — numbered deliverables with a kind, quantity and duration in seconds, plus
// merged dimension / text / rights lists — so it is derived here, on read, and
// never stored. Pure module: safe to import from tests.
// ---------------------------------------------------------------------------

export interface BriefFacts {
  summary: string;
  deliverables: Deliverable[];
  dimensions: string[]; // aspect ratios + resolutions
  durations: string[];
  references: string[];
  exactText: string[];
  brandConstraints: string[];
  rightsConcerns: string[]; // one line per consent/rights flag
  missingInformation: string[];
  confidence: number; // 0..1
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** "60s", "1 min", "1:30", "90 seconds", "1m30s" -> seconds. Null when nothing parseable. */
export function parseDurationSec(text: string | null): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const clock = t.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const mins = t.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)(?![a-z])/);
  const secs = t.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)(?![a-z])/);
  if (mins || secs) return Math.round((mins ? Number(mins[1]) * 60 : 0) + (secs ? Number(secs[1]) : 0));
  const bare = t.match(/^\d+(?:\.\d+)?$/);
  return bare ? Math.round(Number(t)) : null;
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

/** "6 × stills", "3x product shots", "Three cover stills" -> quantity; 1 when none is stated. */
export function parseQuantity(name: string): number {
  const times = name.match(/(?:^|\s)(\d{1,3})\s*[×x]\s/i) ?? name.match(/\b(\d{1,3})\s*[×x]\b/i);
  if (times) return Math.max(1, Number(times[1]));
  // A leading count, but not a duration ("60 second film") or frame rate.
  const lead = name.trim().match(/^(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?!(?:s|secs?|seconds?|mins?|minutes?|hours?|days?|fps)\b)\D/i);
  if (lead) return Math.max(1, Number(lead[1]) || WORD_NUMBERS[lead[1].toLowerCase()] || 1);
  return 1;
}

export function deliverableKind(d: Pick<AnalysisDeliverable, "name" | "format" | "duration">): DeliverableKind {
  const format = d.format.toLowerCase();
  const name = d.name.toLowerCase();
  if (/voice|audio|narrat|\bvo\b/.test(format) || (/voice[- ]?over/.test(name) && !/video|film|spot/.test(format))) return "voiceover";
  if (/still|image|photo|poster|key ?visual|thumbnail|banner|cover art|artwork|frame/.test(format) && !/video|film/.test(format)) return "still";
  if (/cut-?down|reframe|teaser|\bcut\b/.test(name)) return "cutdown";
  const sec = parseDurationSec(d.duration);
  return sec !== null && sec >= 30 ? "film" : "social";
}

export function deriveDeliverables(analysis: Pick<Analysis, "deliverables">): Deliverable[] {
  return analysis.deliverables.map((d, i) => ({
    id: `D${i + 1}`,
    kind: deliverableKind(d),
    title: d.name,
    quantity: parseQuantity(d.name),
    durationSec: parseDurationSec(d.duration),
    aspectRatio: d.aspectRatio,
    resolution: d.resolution,
  }));
}

const FLAG_LABEL: Record<string, string> = {
  logo: "Exact logo",
  packaging_text: "Packaging text",
  person_likeness: "Real person's likeness",
  person_voice: "Real person's voice",
  factual_claim: "Factual claim",
  licensed_music: "Licensed music",
  unclear_rights: "Unclear rights",
  impersonation: "Deceptive impersonation",
  other: "Rights / consent",
};

export function deriveBriefFacts(analysis: Analysis): BriefFacts {
  const nonEmpty = (xs: (string | null)[]) => xs.filter((x): x is string => !!x && x.trim().length > 0);
  return {
    summary: analysis.conciseSummary,
    deliverables: deriveDeliverables(analysis),
    dimensions: uniq(nonEmpty(analysis.deliverables.flatMap((d) => [d.aspectRatio, d.resolution]))),
    durations: uniq(nonEmpty(analysis.deliverables.map((d) => d.duration))),
    references: analysis.suppliedAssets,
    exactText: uniq(nonEmpty(analysis.deliverables.flatMap((d) => d.exactTextRequirements))),
    brandConstraints: analysis.brandConstraints,
    rightsConcerns: analysis.rightsAndConsentFlags.map((f) => {
      const label = FLAG_LABEL[f.kind] ?? f.kind;
      return f.detail.trim() ? `${label}: ${f.detail.trim()}` : label;
    }),
    missingInformation: uniq([...analysis.missingAssets, ...analysis.questionsForClient]),
    confidence: Math.max(0, Math.min(1, analysis.confidence / 100)),
  };
}
