import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRuns } from "./take-rounds";

const t = (attempt: number, createdAt: string) => ({ attempt, createdAt });

test("a re-run restarting at attempt 1 opens a new run, newest first", () => {
  const runs = groupRuns([t(1, "a"), t(2, "b"), t(3, "c"), t(1, "d"), t(2, "e")]);
  assert.deepEqual(runs.map((r) => r.map((x) => x.attempt)), [[1, 2], [1, 2, 3]]);
});

test("retries within a run stay in that run", () => {
  assert.equal(groupRuns([t(1, "a"), t(2, "b"), t(3, "c")]).length, 1);
  assert.equal(groupRuns([]).length, 0);
});
