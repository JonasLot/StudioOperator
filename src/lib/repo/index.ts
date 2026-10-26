import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "@/lib/config";
import type { SqlDriver } from "./driver";
import { SyncSqlDriver } from "./drivers/sync-driver";
import type { SqlDatabase } from "./drivers/sync-types";
import type { StudioRepository } from "./repository";
import { SqlStudioRepository } from "./sql-repository";

const require = createRequire(import.meta.url);

// The app runs locally only: everything lives in one SQLite file on this machine's disk.
function openDriver(): SqlDriver {
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
