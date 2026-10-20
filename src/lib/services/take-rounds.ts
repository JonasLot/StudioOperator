/**
 * A step's takes grouped into runs. A re-run starts again at attempt 1 (retries within a run keep counting
 * up), so a take with attempt 1 opens a new run. Takes are read in creation order; the newest run comes first.
 */
export function groupRuns<T extends { attempt: number; createdAt: string }>(takes: T[]): T[][] {
  const sorted = [...takes].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.attempt - b.attempt);
  const runs: T[][] = [];
  for (const t of sorted) {
    if (!runs.length || t.attempt === 1) runs.push([t]);
    else runs[runs.length - 1].push(t);
  }
  return runs.reverse();
}
