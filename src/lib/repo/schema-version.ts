import { createHash } from "node:crypto";

/**
 * A 32-bit fingerprint of the schema + migrations, stored in PRAGMA user_version so that a changed
 * schema is applied exactly once per database and an unchanged one costs a single query at startup.
 * Pure module so tests can import it.
 */
export function schemaVersion(schema: string, migrations: string[]): number {
  const hash = createHash("sha256").update(schema).update("\0").update(migrations.join("\n")).digest();
  return hash.readInt32BE(0) || 1; // never 0: that is what an untouched database reports
}
