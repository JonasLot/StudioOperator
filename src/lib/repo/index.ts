import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "@/lib/config";
import type { StudioRepository } from "./repository";
import { SqliteStudioRepository, type SqlDatabase } from "./sqlite-repository";

// Native drivers are loaded lazily so a deployment only pulls in the one it uses.
const require = createRequire(import.meta.url);

// Single place that picks the persistence backend. Both drivers expose the same
// synchronous better-sqlite3 API, so SqliteStudioRepository is unchanged either way.
// Swap for a Postgres implementation of StudioRepository here if needed.
function openDatabase(): SqlDatabase {
  if (config.turso.url) {
    // Remote Turso / libSQL: persistent and shared across serverless instances.
    const mod = require("libsql");
    const Database = mod.default ?? mod;
    return new Database(
      config.turso.url,
      config.turso.authToken ? { authToken: config.turso.authToken } : undefined,
    ) as SqlDatabase;
  }
  // Local file: fast and persistent on a normal disk (dev, or a host with a volume).
  const mod = require("better-sqlite3");
  const Database = mod.default ?? mod;
  const abs = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db as SqlDatabase;
}

const g = globalThis as unknown as { __studioRepo?: StudioRepository };

export function getRepo(): StudioRepository {
  if (!g.__studioRepo) g.__studioRepo = new SqliteStudioRepository(openDatabase());
  return g.__studioRepo;
}

export type { StudioRepository };
