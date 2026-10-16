import "server-only";
import type { AuditEntry, AuditKind } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { newId } from "./ids";

/** Append one entry to the autonomy audit log. Every consequential agent action flows through here. */
export function audit(entry: {
  jobId?: string | null;
  kind: AuditKind;
  actor?: AuditEntry["actor"];
  summary: string;
  detail?: string | null;
  costDeltaUsd?: number | null;
}): void {
  getRepo().insertAudit({
    id: newId("au"),
    jobId: entry.jobId ?? null,
    kind: entry.kind,
    actor: entry.actor ?? "agent",
    summary: entry.summary,
    detail: entry.detail ?? null,
    costDeltaUsd: entry.costDeltaUsd ?? null,
    createdAt: new Date().toISOString(),
  });
}

export function listAudit(jobId?: string): AuditEntry[] {
  return getRepo().listAudit(jobId);
}
