import { test } from "node:test";
import assert from "node:assert/strict";
import { schemaVersion } from "./schema-version";

test("the same schema and migrations always give the same version", () => {
  assert.equal(schemaVersion("CREATE TABLE a (x);", ["ALTER TABLE a ADD COLUMN y"]), schemaVersion("CREATE TABLE a (x);", ["ALTER TABLE a ADD COLUMN y"]));
});

test("changing the schema or a migration changes the version", () => {
  const base = schemaVersion("CREATE TABLE a (x);", []);
  assert.notEqual(base, schemaVersion("CREATE TABLE a (x, y);", []));
  assert.notEqual(base, schemaVersion("CREATE TABLE a (x);", ["ALTER TABLE a ADD COLUMN y"]));
});

test("the version is a non-zero 32-bit integer", () => {
  const v = schemaVersion("anything", []);
  assert.ok(Number.isInteger(v) && v !== 0 && v >= -2147483648 && v <= 2147483647);
});
