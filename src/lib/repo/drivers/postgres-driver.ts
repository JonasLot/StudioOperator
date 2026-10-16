import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import type { Pool, PoolClient } from "pg";
import { migrationForPostgres, schemaForPostgres, toPositional, type Row, type SqlDriver } from "../driver";

// node-postgres is loaded lazily so a deployment only pulls in the driver it uses.
const require = createRequire(import.meta.url);

const SCHEMA_LOCK_KEY = 727274; // arbitrary, shared by every instance of this app
const TRANSIENT = /Connection terminated|ECONNRESET|ETIMEDOUT|EPIPE|server closed the connection|timeout exceeded when trying to connect/i;

/**
 * Postgres (Neon, Supabase, Vercel Postgres, RDS, a local server...) over a small connection
 * pool. A transaction checks out one client and every statement in the same async call chain
 * uses it, so the repository code does not have to thread a connection through.
 */
export class PostgresDriver implements SqlDriver {
  readonly dialect = "postgres" as const;
  private pool: Pool;
  private tx = new AsyncLocalStorage<PoolClient>();

  constructor(connectionString: string, opts: { max?: number } = {}) {
    const { Pool: PgPool } = require("pg") as typeof import("pg");
    this.pool = new PgPool({
      connectionString,
      // Serverless functions each hold their own pool; keep it small so many instances cannot exhaust the database.
      max: opts.max ?? (process.env.VERCEL ? 3 : 10),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      application_name: "studio-operator",
    });
    // An idle connection dropped by the server must not crash the process; the pool replaces it.
    this.pool.on("error", () => {});
  }

  private async exec1(sql: string, params: unknown[] | undefined, simple = false): Promise<Row[]> {
    const client = this.tx.getStore();
    const text = simple ? sql : toPositional(sql);
    const attempt = async () => (client ?? this.pool).query(text, simple ? undefined : (params ?? []));
    try {
      return (await attempt()).rows as Row[];
    } catch (err) {
      // A pooled connection can be killed while the function is frozen. Retry once outside a transaction.
      if (!client && TRANSIENT.test((err as Error).message)) return (await attempt()).rows as Row[];
      throw err;
    }
  }

  query(sql: string, params: unknown[] = []): Promise<Row[]> {
    return this.exec1(sql, params);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.exec1(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.exec1(sql, undefined, true);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.tx.getStore()) return fn(); // nested: join the outer transaction
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await this.tx.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    } finally {
      client.release();
    }
  }

  private async readVersion(c: Pick<Pool, "query">): Promise<number | null> {
    try {
      const r = await c.query("SELECT value FROM studio_meta WHERE key = 'schema_version'");
      return r.rows[0] ? Number(r.rows[0].value) : null;
    } catch {
      return null; // table not created yet
    }
  }

  getSchemaVersion(): Promise<number | null> {
    return this.readVersion(this.pool);
  }

  async setSchemaVersion(version: number): Promise<void> {
    await this.pool.query(
      "INSERT INTO studio_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [String(version)],
    );
  }

  async applySchema(schema: string, migrations: string[], version: number): Promise<void> {
    if ((await this.getSchemaVersion()) === version) return;
    // Several serverless instances can start at once and DDL must not race, so do it in one transaction
    // under a database-wide advisory lock (transaction-scoped, so it also works behind a pooler).
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_KEY]);
      await client.query("CREATE TABLE IF NOT EXISTS studio_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      if ((await this.readVersion(client)) !== version) {
        await client.query(schemaForPostgres(schema));
        for (const sql of migrations) {
          await client.query("SAVEPOINT m");
          try {
            await client.query(migrationForPostgres(sql));
            await client.query("RELEASE SAVEPOINT m");
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT m"); // column already exists
          }
        }
        await client.query(
          "INSERT INTO studio_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          [String(version)],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
