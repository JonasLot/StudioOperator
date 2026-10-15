// Core domain records for Studio Operator.
// These are persistence-agnostic: the repository layer maps them to/from storage.

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

export type Decision = "accept" | "review" | "reject";
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

export interface BriefAnalysis {
  id: string;
  jobId: string;
  analyzer: string; // "gpt-6-astra" | "mock-astra"
  summary: string;
  deliverables: Deliverable[];
  dimensions: string[];
  durations: string[];
  references: string[];
  exactText: string[];
  brandConstraints: string[];
  rightsConcerns: string[];
  missingInformation: string[];
  confidence: number; // 0..1
  decision: Decision;
  rationale: string[];
  estimatedShots: number;
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
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
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

export interface JobBundle {
  job: Job;
  analysis: BriefAnalysis | null;
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
