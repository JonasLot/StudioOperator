import "server-only";
import { refreshSecrets } from "@/lib/secrets";
import { refreshSettings } from "@/lib/settings";

/**
 * Settings and API keys saved in the UI live in the database, which is async; `config` reads them
 * through synchronous getters. Call this once at the start of every page, server action and route
 * that touches `config` so those getters see current values. It costs nothing inside the cache TTL.
 */
export async function loadRuntimeConfig(): Promise<void> {
  await Promise.all([refreshSettings(), refreshSecrets()]);
}
