import type { Job, JobStatus } from "./types";

/** Statuses a job can be filed away from. Anything still in flight stays in the pipeline. */
export const CLOSED_STATUSES = ["delivered", "rejected"] as const satisfies readonly JobStatus[];

export function isClosed(status: JobStatus): boolean {
  return (CLOSED_STATUSES as readonly JobStatus[]).includes(status);
}

/** Only closed jobs can be archived, and only once. */
export function canArchive(job: Pick<Job, "status" | "archivedAt">): boolean {
  return isClosed(job.status) && !job.archivedAt;
}

export function isArchived(job: Pick<Job, "archivedAt">): boolean {
  return !!job.archivedAt;
}

/** Split jobs (or rows carrying a job) into what the pipeline shows and what lives in the archive. */
export function partitionArchived<T>(items: T[], pick: (item: T) => Pick<Job, "archivedAt">): { current: T[]; archived: T[] } {
  const current: T[] = [];
  const archived: T[] = [];
  for (const item of items) (isArchived(pick(item)) ? archived : current).push(item);
  return { current, archived };
}
