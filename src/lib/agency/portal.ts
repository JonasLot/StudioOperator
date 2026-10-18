// ===========================================================================
// What a client may see and do on their portal link. Pure functions, no I/O:
// the service loads the rows, these decide what is safe to show. Nothing about
// cost, margin, prompts, models, QA internals, rights notes or operator notes
// ever reaches the client — the view is built from an allow-list, not filtered.
// ===========================================================================

import type { BriefView, ClientFeedback, Generation, JobStatus, Workflow } from "@/lib/domain/types";
import { missingQuestions } from "./client-agent";

export const MAX_FEEDBACK_CHARS = 2000;
export const MAX_FEEDBACK_PER_JOB = 200;
export const MAX_FEEDBACK_PER_MINUTE = 10;

// --- stage timeline ------------------------------------------------------------

export interface PortalStage {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
}

const STAGES = [
  { key: "brief", label: "Brief received", at: ["new", "needs_review"] },
  { key: "planned", label: "Plan agreed", at: ["approved"] },
  { key: "production", label: "In production", at: ["generating"] },
  { key: "review", label: "Your review", at: ["qa"] },
  { key: "delivered", label: "Delivered", at: ["delivered"] },
] as const satisfies readonly { key: string; label: string; at: readonly JobStatus[] }[];

/** The five client-facing stages with the job's position in them; null once the job is closed without delivery. */
export function portalStages(status: JobStatus): PortalStage[] | null {
  if (status === "rejected") return null;
  const current = STAGES.findIndex((s) => (s.at as readonly JobStatus[]).includes(status));
  return STAGES.map((s, i) => ({ key: s.key, label: s.label, state: i < current ? "done" : i === current ? "current" : "upcoming" }));
}

// --- brief ---------------------------------------------------------------------

export interface PortalBrief {
  summary: string;
  deliverables: { id: string; title: string; detail: string }[];
  exactText: string[];
  brandConstraints: string[];
}

const kindLabel = { film: "Film", cutdown: "Cut-down", still: "Still", voiceover: "Voiceover", social: "Social" } as const;

export function portalBrief(b: BriefView): PortalBrief {
  return {
    summary: b.summary,
    deliverables: b.deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      detail: [kindLabel[d.kind], d.quantity > 1 ? `×${d.quantity}` : null, d.durationSec ? `${d.durationSec}s` : null, d.aspectRatio, d.resolution].filter(Boolean).join(" · "),
    })),
    exactText: b.exactText,
    brandConstraints: b.brandConstraints,
  };
}

// --- questions -----------------------------------------------------------------

export interface PortalQuestion {
  /** The question text doubles as its key, so answers survive a re-analysis that reorders the list. */
  question: string;
  answer: string | null;
}

export function portalQuestions(brief: BriefView | null, feedback: ClientFeedback[]): PortalQuestion[] {
  if (!brief) return [];
  return missingQuestions(brief).map((q) => ({
    question: q.question,
    answer: [...feedback].reverse().find((f) => f.kind === "answer" && f.ref === q.question)?.body ?? null,
  }));
}

// --- deliveries ----------------------------------------------------------------

export type DeliveryResponse = { kind: "approve" | "change"; at: string; note: string | null } | null;

export interface PortalDelivery {
  id: string; // generation id — also the key feedback points at
  title: string;
  outputType: "image" | "video" | "audio";
  /** Mock-mode outputs are SVG placeholders and must render as images whatever their nominal type. */
  placeholder: boolean;
  response: DeliveryResponse;
}

/**
 * Only takes the operator has approved and that actually finished. A take the operator is
 * still weighing, rejected or never reviewed is not the client's to see.
 */
export function isClientVisible(g: Pick<Generation, "status" | "outputUrl" | "outputType" | "reviewStatus">): boolean {
  return g.status === "completed" && !!g.outputUrl && !!g.outputType && g.reviewStatus === "approved";
}

export function portalDeliveries(generations: Generation[], workflow: Workflow | null, brief: BriefView | null, feedback: ClientFeedback[]): PortalDelivery[] {
  return generations.filter(isClientVisible).map((g) => {
    const step = workflow?.steps.find((s) => s.id === g.stepId);
    const titles = (step?.deliverableIds ?? []).map((id) => brief?.deliverables.find((d) => d.id === id)?.title).filter((t): t is string => !!t);
    const last = [...feedback].reverse().find((f) => (f.kind === "approve" || f.kind === "change") && f.ref === g.id);
    return {
      id: g.id,
      title: titles.length ? titles.join(" + ") : "Selected work",
      outputType: g.outputType!,
      placeholder: g.outputUrl!.startsWith("/api/mock-output"),
      response: last ? { kind: last.kind as "approve" | "change", at: last.createdAt, note: last.kind === "change" ? last.body : null } : null,
    };
  });
}

/** Deliverable ids a take belongs to, used to point a change request at the right deliverable. */
export function deliverableHint(generation: Pick<Generation, "stepId">, workflow: Workflow | null): string | null {
  return workflow?.steps.find((s) => s.id === generation.stepId)?.deliverableIds[0] ?? null;
}

// --- what is waiting on the client ----------------------------------------------

export function waitingOnClient(questions: PortalQuestion[], deliveries: PortalDelivery[], status: JobStatus): { questions: number; reviews: number } {
  if (status === "delivered" || status === "rejected") return { questions: 0, reviews: 0 };
  return {
    questions: questions.filter((q) => q.answer === null).length,
    reviews: deliveries.filter((d) => d.response === null).length,
  };
}

// --- input checks ----------------------------------------------------------------

/** Trim and bound free text from the client; null when there is nothing to keep. */
export function cleanText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.replace(/\r\n/g, "\n").trim();
  return t.length === 0 ? null : t.slice(0, MAX_FEEDBACK_CHARS);
}

/** Cheap abuse guard for an unauthenticated endpoint: too many messages in the last minute. */
export function tooManyRecent(feedback: Pick<ClientFeedback, "createdAt">[], nowMs: number): boolean {
  return feedback.filter((f) => nowMs - Date.parse(f.createdAt) < 60_000).length >= MAX_FEEDBACK_PER_MINUTE;
}
