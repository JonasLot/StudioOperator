import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "@/lib/config";
import type { SqlDriver } from "./driver";
import { PostgresDriver } from "./drivers/postgres-driver";
import { SyncSqlDriver } from "./drivers/sync-driver";
import type { SqlDatabase } from "./drivers/sync-types";
import type { StudioRepository } from "./repository";
import { SqlStudioRepository } from "./sql-repository";

// Native drivers are loaded lazily so a deployment only pulls in the one it uses.
const require = createRequire(import.meta.url);

// Single place that picks the persistence backend, in order of preference:
//  1. Postgres (DATABASE_URL / POSTGRES_URL) — durable and shared across serverless instances.
//  2. Turso / libSQL (TURSO_DATABASE_URL) — durable, SQLite-compatible.
//  3. A local SQLite file — fast and persistent on a normal disk (dev, or a host with a volume).
// All three run the same SqlStudioRepository.
function openDriver(): SqlDriver {
  if (config.postgres.url) return new PostgresDriver(config.postgres.url);
  if (config.turso.url) {
    const mod = require("libsql");
    const Database = mod.default ?? mod;
    return new SyncSqlDriver(new Database(config.turso.url, config.turso.authToken ? { authToken: config.turso.authToken } : undefined) as SqlDatabase);
  }
  const mod = require("better-sqlite3");
  const Database = mod.default ?? mod;
  const abs = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return new SyncSqlDriver(db as SqlDatabase);
}

const g = globalThis as unknown as { __studioRepo?: StudioRepository };

export function getRepo(): StudioRepository {
  if (!g.__studioRepo) g.__studioRepo = new SqlStudioRepository(openDriver());
  return g.__studioRepo;
}

/** Which backend is in use, for the Settings screen. */
export function storageKind(): "postgres" | "turso" | "sqlite" {
  return config.postgres.url ? "postgres" : config.turso.url ? "turso" : "sqlite";
}
