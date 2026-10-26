/**
 * Minimal structural type for a synchronous, better-sqlite3-compatible driver.
 * Satisfied by `better-sqlite3` (local file).
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
