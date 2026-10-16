import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { toRowObjects, type SqlDatabase } from "./sync-types";
import type { Row, SqlDriver } from "../driver";

/**
 * Adapts a synchronous, better-sqlite3-compatible driver (a local SQLite file, or libSQL /
 * Turso) to the async SqlDriver. The calls themselves stay synchronous underneath; what this
 * adds is a transaction that can span `await`s without another request's statements sneaking
 * into it: while a transaction is open, statements from other call chains wait their turn.
 */
export class SyncSqlDriver implements SqlDriver {
  readonly dialect = "sqlite" as const;
  private inTx = new AsyncLocalStorage<true>();
  private active: Promise<void> | null = null;

  constructor(private db: SqlDatabase) {}

  private async turn() {
    while (this.active && !this.inTx.getStore()) await this.active;
  }

  async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    await this.turn();
    return toRowObjects(this.db.prepare(sql).all(...params));
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.turn();
    this.db.prepare(sql).run(...params);
  }

  async exec(sql: string): Promise<void> {
    await this.turn();
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTx.getStore()) return fn(); // nested: join the outer transaction
    while (this.active) await this.active;
    let release!: () => void;
    this.active = new Promise<void>((resolve) => (release = resolve));
    try {
      this.db.exec("BEGIN");
      try {
        const result = await this.inTx.run(true, fn);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw err;
      }
    } finally {
      this.active = null;
      release();
    }
  }

  async getSchemaVersion(): Promise<number | null> {
    try {
      const row = this.db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
      return typeof row?.user_version === "number" ? row.user_version : null;
    } catch {
      return null;
    }
  }

  async setSchemaVersion(version: number): Promise<void> {
    try {
      this.db.exec(`PRAGMA user_version = ${version}`);
    } catch {
      /* unsupported: the schema is simply re-applied next start */
    }
  }

  async applySchema(schema: string, migrations: string[], version: number): Promise<void> {
    if ((await this.getSchemaVersion()) === version) return;
    this.db.exec(schema);
    for (const sql of migrations) {
      try {
        this.db.exec(sql);
      } catch {
        /* column already exists */
      }
    }
    await this.setSchemaVersion(version);
  }
}
