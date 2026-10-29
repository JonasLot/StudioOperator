import test from "node:test";
import assert from "node:assert/strict";
import { canArchive, isClosed, partitionArchived } from "./archive";

test("only delivered and rejected jobs count as closed", () => {
  assert.equal(isClosed("delivered"), true);
  assert.equal(isClosed("rejected"), true);
  for (const s of ["new", "needs_review", "approved", "generating", "qa"] as const) assert.equal(isClosed(s), false);
});

test("a job can be archived once it is closed, and only once", () => {
  assert.equal(canArchive({ status: "delivered", archivedAt: null }), true);
  assert.equal(canArchive({ status: "rejected", archivedAt: null }), true);
  assert.equal(canArchive({ status: "qa", archivedAt: null }), false);
  assert.equal(canArchive({ status: "delivered", archivedAt: "2026-10-29T10:00:00Z" }), false);
});

test("partition keeps order and separates archived rows", () => {
  const rows = [
    { job: { id: "a", archivedAt: null } },
    { job: { id: "b", archivedAt: "2026-10-01T00:00:00Z" } },
    { job: { id: "c", archivedAt: null } },
  ];
  const { current, archived } = partitionArchived(rows, (r) => r.job);
  assert.deepEqual(current.map((r) => r.job.id), ["a", "c"]);
  assert.deepEqual(archived.map((r) => r.job.id), ["b"]);
});
