// ---------------------------------------------------------------------------
// The one thing the repository needs from a database: run SQL, asynchronously.
// The local SQLite driver implements it. Pure types so tests can import them.
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;

export interface SqlDriver {
  readonly dialect: "sqlite";
  /** Run a statement that returns rows. */
  query(sql: string, params?: unknown[]): Promise<Row[]>;
  /** Run a statement and ignore any rows. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Run several statements without parameters (schema, wipe). */
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` atomically: statements issued by this driver while `fn` runs, from the same
   * async call chain, belong to the transaction. Nested calls join the outer transaction.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** The schema fingerprint this database was last prepared with, or null. */
  getSchemaVersion(): Promise<number | null>;
  setSchemaVersion(version: number): Promise<void>;
  /** Apply the portable schema once, safely even if several instances start at the same time. */
  applySchema(schema: string, migrations: string[], version: number): Promise<void>;
}
