// Core domain records for Studio Operator.
// These are persistence-agnostic: the repository layer maps them to/from storage.

import type { Analysis } from "@/lib/analysis/schema";
import type { FinalDecision } from "@/lib/analysis/decision";
import type { BriefFacts } from "@/lib/analysis/view";

export const JOB_SOURCES = ["upwork", "fiverr", "contra", "email", "direct"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const JOB_STATUSES = [
  "new",
  "needs_review",
  "approved",
  "generating",
  "qa",
  "delivered",
  "rejected",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "superseded";

export interface Job {
  id: string;
  title: string;
  source: JobSource;
  clientName: string | null;
  rawBrief: string;
  budget: number; // client price, USD
  deadline: string; // ISO date
  status: JobStatus;
  clientNotes: string | null;
  referenceAssets: string[]; // URLs or file names pasted by the operator
  sourceFeePct: number; // 0..1 — platform / channel fee taken from client price
  contingencyPct: number; // 0..1 — buffer on generation spend
  rightsCleared: boolean; // human has acknowledged/cleared rights concerns
  templateId: string | null; // productized service template, when the job runs on one
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DeliverableKind = "film" | "cutdown" | "still" | "voiceover" | "social";

export interface Deliverable {
  id: string; // short key, e.g. "D1"
  kind: DeliverableKind;
  title: string;
  quantity: number;
  durationSec: number | null;
  aspectRatio: string | null;
  resolution: string | null;
}

/**
 * What screens, QA and revision planning read about a brief. Derived on read from the
 * latest IntakeAnalysis (human-edited if present, else the model's), never stored:
 * the structured Analysis is the single source of truth.
 */
export interface BriefView extends BriefFacts {
  id: string; // the IntakeAnalysis id it was derived from
  jobId: string;
  analyzer: string; // "gpt-6-astra" | "mock-astra" | "mock-astra (fallback)"
  decision: FinalDecision; // the application's deterministic decision
  rationale: string[];
  createdAt: string;
}

export type ModelCategory = "image" | "video" | "voice" | "editing" | "finishing";

export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked" | "skipped";

export interface WorkflowStep {
  id: string;
  workflowId: string;
  order: number;
  name: string;
  category: ModelCategory;
  modelId: string; // catalog id
  purpose: string;
  inputs: string[];
  expectedOutputs: string[];
  deliverableIds: string[];
  estimatedAttempts: number;
  unitCost: number;
  estimatedTotalCost: number;
  status: StepStatus;
}

export interface Workflow {
  id: string;
  jobId: string;
  version: number;
  approvalStatus: ApprovalStatus;
  maxBudget: number; // approved ceiling for generation spend
  estimatedTotalCost: number;
  approvedAt: string | null;
  approvedBy: string | null;
  notes: string | null;
  createdAt: string;
  steps: WorkflowStep[];
}

export type GenerationStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled" | "blocked";

export const TAKE_REVIEWS = ["pending", "approved", "rejected"] as const;
/** The operator's verdict on a take. `selected` stays the delivery pick; approving selects, rejecting deselects. */
export type TakeReview = (typeof TAKE_REVIEWS)[number];

export interface Generation {
  id: string;
  jobId: string;
  workflowId: string;
  stepId: string;
  revisionId: string | null;
  attempt: number;
  provider: "higgsfield" | "mock";
  providerRequestId: string | null;
  statusUrl: string | null;
  model: string;
  prompt: string;
  status: GenerationStatus;
  costEstimate: number;
  actualCost: number | null;
  outputUrl: string | null;
  outputType: "image" | "video" | "audio" | null;
  selected: boolean;
  reviewStatus: TakeReview;
  reviewNote: string | null;
  error: string | null;
  // Application-level timeout: set when polling exceeds the configured limit.
  // Kept separate from `status` so an internal timeout is never misreported as a
  // provider status.
  timedOutAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** A completed output copied into application-controlled storage (provider URLs expire). */
export interface StoredAsset {
  id: string;
  generationId: string;
  jobId: string;
  kind: "image" | "video" | "audio";
  mime: string;
  data: string; // base64 bytes
  sourceUrl: string | null; // original provider URL, for reference
  bytes: number;
  createdAt: string;
}

export type RevisionAction = "regenerate_shot" | "regrade" | "fix_text" | "rerecord_voice" | "re_edit" | "new_deliverable" | "clarify";

export interface Revision {
  id: string;
  jobId: string;
  clientNote: string;
  affectedDeliverable: string | null;
  recommendedAction: RevisionAction;
  actionSummary: string;
  modelId: string | null;
  attempts: number;
  expectedIncrementalCost: number;
  materialChange: boolean;
  requiresApproval: boolean;
  approvalReason: string | null;
  approvalStatus: ApprovalStatus;
  runStatus: "not_started" | "running" | "done";
  createdAt: string;
}

export type ApprovalKind =
  | "initial_workflow"
  | "rights_clearance"
  | "budget_increase"
  | "workflow_change"
  | "revision"
  | "final_delivery";

export interface ApprovalRequest {
  id: string;
  jobId: string;
  kind: ApprovalKind;
  status: "pending" | "approved" | "rejected";
  title: string;
  reason: string;
  amount: number | null;
  refId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  jobId: string;
  actor: "operator" | "agent" | "system";
  message: string;
  createdAt: string;
}

export type ReviewStatus = "pending" | "approved" | "rejected";

/**
 * The structured intake analysis (OpenAI Responses / mock) plus the application's
 * deterministic decision. `original` is exactly what the analyzer produced;
 * `edited` is the human-reviewed version (null until a human saves edits), so the
 * two can be compared. The effective analysis is `edited ?? original`.
 */
export interface IntakeAnalysis {
  id: string;
  jobId: string;
  analyzer: string; // "gpt-6-astra" | "mock-astra" | "mock-astra (fallback)"
  original: Analysis;
  edited: Analysis | null;
  decision: FinalDecision; // deterministic app decision on the effective analysis
  decisionReasons: string[];
  estimatedSpend: number; // deterministic catalog-priced estimate, USD
  reviewStatus: TakeReview;
  reviewedBy: string | null;
  reviewedAt: string | null;
  warning: string | null;
  createdAt: string;
}

// ===========================================================================
// Supervised autonomy: the Client Agent, autonomy settings, client memory,
// audit log and escalations. The agent runs the routine client relationship;
// the human stays responsible for the promises that matter.
// ===========================================================================

/** Messages the Client Agent can produce. Each is either auto-sendable or drafted for approval. */
export const MESSAGE_TYPES = [
  "intake_questions",
  "asset_request",
  "proposal",
  "progress_update",
  "concept_presentation",
  "revision_reply",
  "change_order",
  "delivery",
  "feedback_request",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Where a message would go. Third-party marketplaces are never auto-sent without an approved integration. */
export type MessageChannel = "marketplace" | "direct_email" | "client_portal";
export type AgentMessageStatus = "drafted" | "approved" | "sent" | "blocked";

export interface AgentMessage {
  id: string;
  jobId: string;
  type: MessageType;
  channel: MessageChannel;
  subject: string;
  body: string;
  status: AgentMessageStatus;
  autoAllowed: boolean; // autonomy settings + channel rules permit sending without approval
  heldReason: string | null; // why it is drafted rather than auto-sent
  createdAt: string;
  sentAt: string | null;
}

/** Every consequential thing the agent did or proposed, for the autonomy audit log. */
export const AUDIT_KINDS = [
  "decision",
  "message_draft",
  "message_sent",
  "approval",
  "generation",
  "repair",
  "cost_change",
  "escalation",
  "memory",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export interface AuditEntry {
  id: string;
  jobId: string | null;
  kind: AuditKind;
  actor: "agent" | "operator" | "system";
  summary: string;
  detail: string | null; // optional human-readable extra context
  costDeltaUsd: number | null; // for generation / repair / cost_change entries
  createdAt: string;
}

/** Conditions that always pause the workflow for a human, regardless of spend. */
export const PAUSE_CONDITIONS = [
  "likeness_or_voice",
  "unclear_ownership",
  "factual_claims",
  "packaging_or_regulated",
  "negative_margin",
  "deadline_risk",
  "client_dispute",
] as const;
export type PauseCondition = (typeof PAUSE_CONDITIONS)[number];

export interface AutonomySettings {
  id: string; // "default" — single account-level row for the demo
  maxAutoSpendPerJobUsd: number;
  maxAutoSpendPerRepairUsd: number;
  maxAttemptsPerStep: number;
  allowedModelFamilies: string[]; // catalog model families the agent may choose automatically
  autoSendMessageTypes: MessageType[]; // which messages may be sent without approval
  autoShareConcepts: boolean;
  finalDeliveryAlwaysApproval: boolean;
  alwaysPause: Record<PauseCondition, boolean>;
  updatedAt: string;
}

export interface Escalation {
  id: string;
  jobId: string | null;
  reason: PauseCondition | "spend_limit" | "new_concern" | "qa";
  title: string;
  detail: string;
  recommendedAction: string;
  status: "open" | "resolved";
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** Account-level memory about a client. Never consent for a new person's likeness/voice or a new use. */
export interface ClientMemory {
  id: string;
  clientKey: string; // normalized client name
  displayName: string;
  logos: string[];
  colors: string[];
  fonts: string[];
  tone: string | null;
  productDetails: string[];
  winningAssets: string[];
  rejectedStyles: string[];
  deliveryPreferences: string | null;
  communicationPreferences: string | null;
  updatedAt: string;
}

export interface JobBundle {
  job: Job;
  analysis: BriefView | null;
  intake: IntakeAnalysis | null;
  workflow: Workflow | null;
  generations: Generation[];
  revisions: Revision[];
  approvals: ApprovalRequest[];
  activity: ActivityEvent[];
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  approved: "Approved",
  generating: "Generating",
  qa: "QA",
  delivered: "Delivered",
  rejected: "Rejected",
};

export const SOURCE_LABEL: Record<JobSource, string> = {
  upwork: "Upwork",
  fiverr: "Fiverr",
  contra: "Contra",
  email: "Email",
  direct: "Direct lead",
};

export const CATEGORY_LABEL: Record<ModelCategory, string> = {
  image: "Image",
  video: "Video",
  voice: "Voice",
  editing: "Editing",
  finishing: "Finishing",
};

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  intake_questions: "Intake questions",
  asset_request: "Asset request",
  proposal: "Proposal",
  progress_update: "Progress update",
  concept_presentation: "Concept presentation",
  revision_reply: "Revision reply",
  change_order: "Change order",
  delivery: "Delivery",
  feedback_request: "Feedback request",
};

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
  marketplace: "Marketplace",
  direct_email: "Direct email",
  client_portal: "Client portal",
};

export const PAUSE_LABEL: Record<PauseCondition, string> = {
  likeness_or_voice: "Likeness or voice",
  unclear_ownership: "Unclear asset ownership",
  factual_claims: "Factual advertising claims",
  packaging_or_regulated: "Exact packaging / regulated copy",
  negative_margin: "Negative expected margin",
  deadline_risk: "Missed-deadline risk",
  client_dispute: "Client dispute",
};

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  decision: "Decision",
  message_draft: "Message drafted",
  message_sent: "Message sent",
  approval: "Approval",
  generation: "Generation",
  repair: "Repair",
  cost_change: "Cost change",
  escalation: "Escalation",
  memory: "Client memory",
};

// --- client portal -----------------------------------------------------------

/** The per-job link the client opens. The token is the credential, so it is only ever shown to the operator. */
export interface ClientShare {
  id: string;
  jobId: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
}

export const CLIENT_FEEDBACK_KINDS = ["answer", "brief_ok", "brief_change", "approve", "change", "comment"] as const;
export type ClientFeedbackKind = (typeof CLIENT_FEEDBACK_KINDS)[number];

/**
 * Something the client wrote on the portal. `ref` points at what it is about: an intake
 * question id (answer), a deliverable/take id (approve, change) or null (brief, comment).
 * A "change" that could be logged as a revision carries that revision's id.
 */
export interface ClientFeedback {
  id: string;
  jobId: string;
  kind: ClientFeedbackKind;
  ref: string | null;
  body: string;
  revisionId: string | null;
  createdAt: string;
}
