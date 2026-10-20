import "server-only";
import { getRepo } from "@/lib/repo";
import { parseDraftModel, parseMockSetting, resolveMockForced, resolveMockMode, type DraftModel, type MockSetting, type Profile } from "./rules";

// ---------------------------------------------------------------------------
// Settings edited in the UI, stored in the database: the operator profile and the
// mock-mode override. Reads are cached briefly (config is read on every provider
// call); writes refresh this instance immediately, other serverless instances catch
// up within the TTL.
// ---------------------------------------------------------------------------

const TTL_MS = 5_000;
type Entry = { value: string; updatedAt: string };
type Snapshot = { at: number; values: Map<string, Entry> };
const g = globalThis as unknown as { __studioSettings?: Snapshot };

/** What is currently cached; a synchronous read, so config getters can use it. See refreshSettings(). */
const snapshot = (): Map<string, Entry> => g.__studioSettings?.values ?? new Map();

/**
 * Reload every setting with one query when the cache is older than the TTL. The database is async, but
 * `config.mockMode` and friends are synchronous getters, so every entry point (page, server action)
 * calls this once first (see loadRuntimeConfig); the getters then read the cache.
 *
 * A failed read must not look like "nothing is set": that would flip a saved Live choice back to mock.
 * It keeps the last good values and retries on the next call.
 */
export async function refreshSettings(): Promise<void> {
  const hit = g.__studioSettings;
  if (hit && Date.now() - hit.at < TTL_MS) return;
  try {
    const values = new Map<string, Entry>();
    for (const row of await getRepo().listSettings()) values.set(row.key, { value: row.value, updatedAt: row.updatedAt });
    g.__studioSettings = { at: Date.now(), values };
  } catch {
    /* keep serving the last good values */
  }
}

const read = (key: string): string | null => snapshot().get(key)?.value ?? null;

async function write(key: string, value: string | null) {
  const repo = getRepo();
  if (value === null) await repo.deleteSetting(key);
  else await repo.setSetting(key, value);
  const values = new Map(snapshot());
  if (value === null) values.delete(key);
  else values.set(key, { value, updatedAt: new Date().toISOString() });
  g.__studioSettings = { at: Date.now(), values };
}

// --- mock-mode override ---

export function mockSetting(): MockSetting | null {
  return parseMockSetting(read("mockMode"));
}
export async function setMockSetting(value: MockSetting | null) {
  await write("mockMode", value);
}
/** When the mock-mode choice was stored in the database, or null when nothing is stored. */
export const mockSettingSavedAt = (): string | null => snapshot().get("mockMode")?.updatedAt ?? null;
export const isMockMode = () => resolveMockMode(mockSetting(), process.env.STUDIO_MOCK_MODE);
export const isMockForced = () => resolveMockForced(mockSetting(), process.env.STUDIO_MOCK_MODE);

// --- operator profile ---

export const DEFAULT_STUDIO_NAME = "Independent studio";

export function getProfile(): Profile & { saved: boolean } {
  const fallback: Profile = { displayName: process.env.OPERATOR_NAME || "Operator", studioName: DEFAULT_STUDIO_NAME, email: "" };
  const raw = read("profile");
  if (!raw) return { ...fallback, saved: false };
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      displayName: p.displayName || fallback.displayName,
      studioName: p.studioName || fallback.studioName,
      email: p.email || "",
      saved: true,
    };
  } catch {
    return { ...fallback, saved: false };
  }
}

export async function saveProfile(profile: Profile) {
  await write("profile", JSON.stringify(profile));
}

/** The name approvals and audit entries are recorded under. */
export const operatorName = () => getProfile().displayName;

// --- first-phase AI endpoint ---

/** The endpoint and model saved on the Settings page, or null (then the environment variables apply). */
export const draftModelSetting = (): DraftModel | null => parseDraftModel(read("draftModel"));

export async function saveDraftModel(value: DraftModel | null) {
  await write("draftModel", value ? JSON.stringify(value) : null);
}
