import { Badge } from "@/components/ui/badge";
import type { FinalDecision } from "@/lib/analysis/decision";
import type { ApprovalRequest, GenerationStatus, JobStatus, StepStatus } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/types";

const JOB_VARIANT: Record<JobStatus, "outline" | "info" | "warn" | "ok" | "bad" | "secondary"> = {
  new: "outline",
  needs_review: "warn",
  approved: "info",
  generating: "info",
  qa: "warn",
  delivered: "ok",
  rejected: "bad",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={JOB_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function DecisionBadge({ decision }: { decision: FinalDecision | null }) {
  if (!decision) return <Badge variant="outline">Not analysed</Badge>;
  const v = decision === "accept" ? "ok" : decision === "human_review" ? "warn" : "bad";
  const label = decision === "accept" ? "Accept" : decision === "human_review" ? "Review" : "Reject";
  return <Badge variant={v}>{label}</Badge>;
}

export function GenStatusBadge({ status }: { status: GenerationStatus }) {
  const map: Record<GenerationStatus, ["ok" | "warn" | "bad" | "info" | "outline", string]> = {
    queued: ["outline", "Queued"],
    in_progress: ["info", "Rendering"],
    completed: ["ok", "Done"],
    failed: ["bad", "Failed"],
    nsfw: ["bad", "Moderated"],
    canceled: ["outline", "Canceled"],
    blocked: ["warn", "Blocked"],
  };
  const [v, l] = map[status];
  return <Badge variant={v}>{l}</Badge>;
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, ["ok" | "warn" | "bad" | "info" | "outline", string]> = {
    pending: ["outline", "Pending"],
    running: ["info", "Running"],
    done: ["ok", "Done"],
    failed: ["bad", "Failed"],
    blocked: ["warn", "Needs approval"],
    skipped: ["outline", "Skipped"],
  };
  const [v, l] = map[status];
  return <Badge variant={v}>{l}</Badge>;
}

export function ApprovalBadge({ a }: { a: Pick<ApprovalRequest, "status"> | { status: string } }) {
  const s = a.status;
  if (s === "approved") return <Badge variant="ok">Approved</Badge>;
  if (s === "rejected") return <Badge variant="bad">Declined</Badge>;
  if (s === "pending") return <Badge variant="warn">Awaiting you</Badge>;
  if (s === "superseded") return <Badge variant="outline">Superseded</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}
