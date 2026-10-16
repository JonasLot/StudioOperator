// ---------------------------------------------------------------------------
// The one thing the repository needs from a database: run SQL, asynchronously.
// SQLite (local file), libSQL (Turso) and Postgres each implement it; the
// repository's SQL is written once with `?` placeholders and the Postgres driver
// converts them. Pure types + helpers so tests can import them.
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;

export interface SqlDriver {
  readonly dialect: "sqlite" | "postgres";
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

/**
 * `?` placeholders -> `$1, $2, ...` for Postgres. Question marks inside quoted strings or
 * identifiers are left alone.
 */
export function toPositional(sql: string): string {
  let out = "";
  let n = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      if (c === quote) {
        if (sql[i + 1] === quote) out += sql[++i]; // doubled quote = escaped quote
        else quote = null;
      }
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else if (c === "?") {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * The repository's SQLite-flavoured schema, expressed for Postgres: single-precision REAL becomes
 * DOUBLE PRECISION (money must not lose digits), and the insertion-order column that SQLite gives
 * every table for free (`rowid`) is added explicitly where the code orders by it.
 */
export function schemaForPostgres(schema: string): string {
  return (
    schema.replace(/\bREAL\b/g, "DOUBLE PRECISION") +
    "\nALTER TABLE activity ADD COLUMN IF NOT EXISTS seq BIGSERIAL;\nALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seq BIGSERIAL;\n"
  );
}

/** Additive column migrations in Postgres syntax (ADD COLUMN IF NOT EXISTS). */
export function migrationForPostgres(sql: string): string {
  return sql.replace(/ADD COLUMN (?!IF NOT EXISTS)/i, "ADD COLUMN IF NOT EXISTS ");
}
