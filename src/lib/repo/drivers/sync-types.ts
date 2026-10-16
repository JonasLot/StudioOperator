/**
 * Minimal structural type for a synchronous, better-sqlite3-compatible driver.
 * Satisfied by both `better-sqlite3` (local file) and `libsql` (remote Turso).
 */
export interface SqlStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
  transaction<T>(fn: () => T): () => T;
}

/** libSQL attaches per-row `_metadata`; it is not a column. */
export function toRowObjects(rows: unknown[]): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).map((r) => {
    if (r && "_metadata" in r) {
      const { _metadata, ...rest } = r;
      void _metadata;
      return rest;
    }
    return r;
  });
}
