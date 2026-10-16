// ===========================================================================
// The Client Agent's language. Pure, deterministic generators that turn a
// brief/analysis/scope into the artefacts a human account manager would write:
// intake questions, asset requests, a scope summary, a proposal, progress
// updates, concept notes, revision interpretation, change orders, a delivery
// package and a post-delivery ask.
//
// Deterministic so the demo is reproducible offline; a live GPT-6 Astra pass
// can replace the prose later without changing the structure. No I/O, no
// server-only — the structural outputs are unit-tested.
// ===========================================================================

import type { BriefView, JobSource, MessageChannel } from "@/lib/domain/types";
import type { ServiceTemplate } from "./templates";

export type QuestionCategory = "quality" | "cost" | "rights" | "deadline";

export interface IntakeQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
}

export interface AssetRequest {
  id: string;
  asset: string;
  why: string;
}

/** Marketplace for third-party platforms (never auto-sent); direct email otherwise. */
export function channelFor(source: JobSource): MessageChannel {
  if (source === "upwork" || source === "fiverr" || source === "contra") return "marketplace";
  return "direct_email";
}

// --- intake questions --------------------------------------------------------

const QUESTION_RULES: { re: RegExp; category: QuestionCategory; question: string }[] = [
  { re: /resolution|aspect|format|dimension/i, category: "quality", question: "Confirm the final delivery format — which aspect ratio(s) and resolution?" },
  { re: /duration|length|\bseconds?\b|runtime/i, category: "quality", question: "What exact runtime should the main deliverable be?" },
  { re: /music|sound|audio|score|sfx/i, category: "quality", question: "Will you supply licensed music, or should we provide an original/library bed?" },
  { re: /brand|logo|palette|guidelines?|font|typeface/i, category: "quality", question: "Can you share the brand guide (logo files, colours, fonts) so we stay on-brand?" },
  { re: /revision/i, category: "cost", question: "How many revision rounds should be included in scope?" },
  { re: /usage|licen[cs]e|rights|territory|term|channel|broadcast/i, category: "rights", question: "What is the usage scope — channels, territory and term?" },
  { re: /deadline|turnaround|timeline|due/i, category: "deadline", question: "What is the firm delivery deadline?" },
  { re: /reference|example|mood|look|style/i, category: "quality", question: "Do you have reference examples you like (and any you dislike)?" },
  { re: /budget|price|scope/i, category: "cost", question: "Is the budget fixed, or should we quote against the scope?" },
];

/**
 * Only the missing questions that materially affect quality, cost, rights or
 * deadline. A missing-information note that maps to none of these is dropped.
 */
export function missingQuestions(
  analysis: Pick<BriefView, "missingInformation" | "rightsConcerns">,
  limit = 6,
): IntakeQuestion[] {
  const out: IntakeQuestion[] = [];
  const seen = new Set<string>();
  const push = (category: QuestionCategory, question: string) => {
    if (seen.has(question)) return;
    seen.add(question);
    out.push({ id: `q${out.length + 1}`, question, category });
  };
  for (const note of analysis.missingInformation) {
    const rule = QUESTION_RULES.find((r) => r.re.test(note));
    if (rule) push(rule.category, rule.question);
  }
  if (analysis.rightsConcerns.length) {
    push("rights", "Can you confirm you own or have cleared the rights to the supplied references and any names/marks shown?");
  }
  return out.slice(0, limit);
}

// --- asset requests ----------------------------------------------------------

/** The specific assets worth requesting for this brief — only those that are relevant. */
export function assetRequests(analysis: Pick<BriefView, "summary" | "brandConstraints" | "exactText" | "rightsConcerns" | "deliverables" | "references">): AssetRequest[] {
  const text = `${analysis.summary} ${analysis.brandConstraints.join(" ")}`.toLowerCase();
  const out: AssetRequest[] = [];
  const add = (asset: string, why: string) => out.push({ id: `a${out.length + 1}`, asset, why });

  const hasStill = analysis.deliverables.some((d) => d.kind === "still");
  const hasVoice = analysis.deliverables.some((d) => d.kind === "voiceover");

  if (/product|packaging|bottle|can|device|pack/.test(text) || hasStill) add("Product image or reference", "To keep the product on-model and correctly proportioned.");
  if (/logo|wordmark|brand/.test(text)) add("Logo (vector or transparent PNG)", "For a clean, legible lockup that is never stretched or recoloured.");
  if (/brand|palette|colou?r|font|guideline/.test(text)) add("Brand guide", "Colours, fonts and tone so every shot stays on-brand.");
  if (analysis.exactText.length || /tagline|end ?card|caption|copy|supers?/.test(text)) add("Exact on-screen copy", "Rendered verbatim — send it character-for-character.");
  if (hasVoice || /pronoun|pronunciation|name/.test(text)) add("Pronunciation notes", "Correct pronunciation of brand and product names in the voiceover.");
  if (analysis.rightsConcerns.some((c) => /voice|likeness|person|consent/i.test(c))) add("Voice / likeness consent", "Written consent before we use any real voice or likeness — this always pauses for a human.");
  add("Examples you like", "Two or three references that capture the direction you want.");
  add("Examples you dislike", "Anything to avoid, so we don't spend takes in the wrong direction.");

  // de-dupe by asset label
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.asset) ? false : (seen.add(r.asset), true)));
}

// --- scope + proposal --------------------------------------------------------

export function scopeSummary(opts: { title: string; clientName: string | null; analysis: Pick<BriefView, "deliverables">; template: ServiceTemplate | null; deadline: string }): string {
  const dels = opts.analysis.deliverables.map((d) => (d.quantity > 1 ? `${d.quantity}× ` : "") + d.title).join(", ") || "the agreed deliverables";
  const base = `Here's the scope as I understand it for "${opts.title}": ${dels}, delivered by ${opts.deadline}.`;
  return opts.template ? `${base} Running on our ${opts.template.name} service (${opts.template.deliverablesSummary}).` : base;
}

export interface ProposalInput {
  title: string;
  clientName: string | null;
  analysis: Pick<BriefView, "deliverables">;
  template: ServiceTemplate | null;
  priceUsd: number;
  deadline: string;
  includedRevisions: number;
  exclusions: string[];
}

export function draftProposal(p: ProposalInput): { subject: string; body: string } {
  const dels = p.analysis.deliverables.map((d) => `  • ${d.quantity > 1 ? `${d.quantity}× ` : ""}${d.title}${d.aspectRatio ? ` (${d.aspectRatio})` : ""}`).join("\n") || "  • The agreed deliverables";
  const exclusions = (p.exclusions.length ? p.exclusions : ["Paid media and ad-account setup", "Licensed music (client-supplied)", "Additional languages or cutdowns beyond the list above"]).map((e) => `  • ${e}`).join("\n");
  const body = [
    `Hi ${p.clientName ?? "there"},`,
    ``,
    `Thanks for the brief — here's a proposal for "${p.title}".`,
    ``,
    `Deliverables:`,
    dels,
    ``,
    `Timeline: delivered by ${p.deadline}.`,
    `Price: $${p.priceUsd.toLocaleString("en-US")} fixed.`,
    `Included revisions: ${p.includedRevisions} round${p.includedRevisions === 1 ? "" : "s"}.`,
    ``,
    `Not included:`,
    exclusions,
    ``,
    `If that looks right, approve and I'll get the look locked on keyframes first.`,
    ``,
    `— Studio Operator`,
  ].join("\n");
  return { subject: `Proposal — ${p.title}`, body };
}

// --- progress + concepts -----------------------------------------------------

export type Milestone = "keyframes_approved" | "motion_complete" | "qa_passed" | "revision_complete";

const MILESTONE_COPY: Record<Milestone, { subject: string; line: string }> = {
  keyframes_approved: { subject: "Look locked", line: "The look is locked on approved keyframes — moving into motion next." },
  motion_complete: { subject: "Motion complete", line: "The hero motion is done and the shots are holding together; we're into edit and finishing." },
  qa_passed: { subject: "First cut ready for review", line: "The first cut has passed our internal QA and is ready for your review." },
  revision_complete: { subject: "Revision applied", line: "Your revision is applied — take a look and let me know if that lands." },
};

export function draftProgressUpdate(milestone: Milestone, opts: { title: string; clientName: string | null }): { subject: string; body: string } {
  const c = MILESTONE_COPY[milestone];
  const body = [`Hi ${opts.clientName ?? "there"},`, ``, `${c.line}`, ``, `— Studio Operator`].join("\n");
  return { subject: `${c.subject} — ${opts.title}`, body };
}

export function presentConcept(opts: { title: string; clientName: string | null; changed: string; decisionNeeded: string }): { subject: string; body: string; decisionNeeded: string } {
  const body = [
    `Hi ${opts.clientName ?? "there"},`,
    ``,
    `Here are the concepts for "${opts.title}". What changed since the brief: ${opts.changed}`,
    ``,
    `What I need from you: ${opts.decisionNeeded}`,
    ``,
    `— Studio Operator`,
  ].join("\n");
  return { subject: `Concepts for your call — ${opts.title}`, body, decisionNeeded: opts.decisionNeeded };
}

// --- revision interpretation -------------------------------------------------

export type RevisionStepCategory = "image" | "video" | "voice" | "editing" | "finishing";

export interface RevisionInterpretation {
  affectedDeliverable: string | null;
  affectedStep: RevisionStepCategory;
  kind: "included" | "scope_change";
  rationale: string;
}

const SCOPE_CHANGE_RE = /\b(add|also need|another|extra|additional|new (deliverable|version|cut|language|aspect)|one more|as well|plus a)\b/i;

/**
 * Interpret free-text revision feedback: which deliverable and production step
 * it touches, and whether it's an included revision or a scope change.
 */
export function interpretRevision(
  note: string,
  opts: { includedRemaining: number; deliverableHint?: string | null },
): RevisionInterpretation {
  const n = note.toLowerCase();
  let step: RevisionStepCategory = "finishing";
  if (/\b(reflection|continuity|geometry|morph|warp|camera|motion|shot|orbit|parallax)\b/.test(n)) step = "video";
  else if (/\b(text|type|spelling|caption|logo|title|end ?card|word)\b/.test(n)) step = "image";
  else if (/\b(voice|vo|narrat|pronunc|audio|read)\b/.test(n)) step = "voice";
  else if (/\b(cut|pacing|timing|edit|sequence|order of)\b/.test(n)) step = "editing";
  else if (/\b(warm|cool|colou?r|grade|bright|dark|mood|tone|hopeful|contrast|exposure)\b/.test(n)) step = "finishing";

  const scope = SCOPE_CHANGE_RE.test(n) || opts.includedRemaining <= 0;
  const rationale = SCOPE_CHANGE_RE.test(n)
    ? "Reads as new scope (adds a deliverable/version beyond the agreed list)."
    : opts.includedRemaining <= 0
      ? "Within the brief, but the included revision rounds are used up."
      : "A controlled edit within the agreed scope and included revisions.";
  return { affectedDeliverable: opts.deliverableHint ?? null, affectedStep: step, kind: scope ? "scope_change" : "included", rationale };
}

export function draftRevisionReply(opts: { clientName: string | null; interpretation: RevisionInterpretation; note: string }): { subject: string; body: string } {
  const i = opts.interpretation;
  const line = i.kind === "included"
    ? `Got it — that's an included revision. I'll take it into the ${i.affectedStep} stage and send an updated cut.`
    : `Thanks — that one goes a little beyond the agreed scope, so I've drafted a short change order for your call before we proceed.`;
  const body = [`Hi ${opts.clientName ?? "there"},`, ``, `On your note "${opts.note.trim()}":`, line, ``, `— Studio Operator`].join("\n");
  return { subject: "On your revision note", body };
}

export function draftChangeOrder(opts: { title: string; clientName: string | null; note: string; addedPriceUsd: number; addedScope: string; newDeadline?: string }): { subject: string; body: string } {
  const body = [
    `Hi ${opts.clientName ?? "there"},`,
    ``,
    `Your request — "${opts.note.trim()}" — adds to the agreed scope, so here's a quick change order:`,
    ``,
    `  • Added scope: ${opts.addedScope}`,
    `  • Additional price: $${opts.addedPriceUsd.toLocaleString("en-US")}`,
    opts.newDeadline ? `  • Revised delivery: ${opts.newDeadline}` : `  • Delivery: unchanged`,
    ``,
    `Approve this and I'll fold it in; otherwise we'll deliver the original scope as agreed.`,
    ``,
    `— Studio Operator`,
  ].join("\n");
  return { subject: `Change order — ${opts.title}`, body };
}

// --- delivery + post-delivery ------------------------------------------------

export interface DeliveryPackage {
  fileList: string[];
  usageNotes: string[];
  message: string;
}

export function deliveryPackage(opts: {
  title: string;
  clientName: string | null;
  selectedTitles: string[];
  template: ServiceTemplate | null;
  usageScope?: string | null;
}): DeliveryPackage {
  const fileList = opts.template?.deliveryPackage.length ? [...opts.template.deliveryPackage] : opts.selectedTitles.map((t, i) => `${String(i + 1).padStart(2, "0")}_${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  const usageNotes = [
    opts.usageScope ? `Usage: ${opts.usageScope}.` : "Usage: as agreed in the proposal; confirm channels/territory/term before paid use.",
    "Masters are delivered graded and at the agreed resolution.",
    "Client-supplied music is licensed by the client.",
    "No real-person likeness or voice is used unless separately consented.",
  ];
  const message = [
    `Hi ${opts.clientName ?? "there"},`,
    ``,
    `"${opts.title}" is ready. Files are attached below with a short usage note.`,
    `Everything was produced inside the approved budget and timeline.`,
    ``,
    `Let me know if you'd like anything tweaked within the included revisions.`,
    ``,
    `— Studio Operator`,
  ].join("\n");
  return { fileList, usageNotes, message };
}

export function postDeliveryAsk(opts: { title: string; clientName: string | null }): { subject: string; body: string } {
  const body = [
    `Hi ${opts.clientName ?? "there"},`,
    ``,
    `Hope "${opts.title}" is landing well. Three quick things:`,
    `  1. Any feedback on how the project went?`,
    `  2. If you were happy, would you be open to a short testimonial?`,
    `  3. A lot of clients keep a steady stream going — want me to put together a recurring creative package (e.g. a monthly set of cutdowns)?`,
    ``,
    `— Studio Operator`,
  ].join("\n");
  return { subject: `Quick follow-up — ${opts.title}`, body };
}
