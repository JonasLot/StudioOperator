import "server-only";
import { config } from "@/lib/config";
import type { StudioRepository } from "./repository";
import { SqliteStudioRepository } from "./sqlite-repository";

// Single place that picks the persistence backend. Swap for a Postgres implementation here.
const g = globalThis as unknown as { __studioRepo?: StudioRepository };

export function getRepo(): StudioRepository {
  if (!g.__studioRepo) g.__studioRepo = new SqliteStudioRepository(config.databasePath);
  return g.__studioRepo;
}

export type { StudioRepository };
