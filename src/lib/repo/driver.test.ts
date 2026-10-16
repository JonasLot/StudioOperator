import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationForPostgres, schemaForPostgres, toPositional } from "./driver";

test("toPositional numbers the placeholders in order", () => {
  assert.equal(toPositional("SELECT * FROM jobs WHERE id = ? AND status = ?"), "SELECT * FROM jobs WHERE id = $1 AND status = $2");
  assert.equal(toPositional("INSERT INTO t (a,b,c) VALUES (?,?,?)"), "INSERT INTO t (a,b,c) VALUES ($1,$2,$3)");
});

test("toPositional leaves question marks inside strings and identifiers alone", () => {
  assert.equal(toPositional("SELECT 'what?' AS q, \"odd?col\" FROM t WHERE x = ?"), "SELECT 'what?' AS q, \"odd?col\" FROM t WHERE x = $1");
  assert.equal(toPositional("SELECT 'it''s ? fine' WHERE y = ?"), "SELECT 'it''s ? fine' WHERE y = $1");
  assert.equal(toPositional("SELECT 1"), "SELECT 1");
});

test("schemaForPostgres turns REAL into DOUBLE PRECISION and adds the insertion-order columns", () => {
  const out = schemaForPostgres("CREATE TABLE a (id TEXT PRIMARY KEY, amount REAL NOT NULL, realm TEXT);");
  assert.match(out, /amount DOUBLE PRECISION NOT NULL/);
  assert.match(out, /realm TEXT/); // only the whole word REAL is changed
  assert.match(out, /ALTER TABLE activity ADD COLUMN IF NOT EXISTS seq BIGSERIAL/);
  assert.match(out, /ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seq BIGSERIAL/);
});

test("migrationForPostgres makes ADD COLUMN idempotent", () => {
  assert.equal(migrationForPostgres("ALTER TABLE jobs ADD COLUMN template_id TEXT"), "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS template_id TEXT");
  assert.equal(migrationForPostgres("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS x TEXT"), "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS x TEXT");
});
