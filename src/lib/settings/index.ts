import "server-only";
import { getRepo } from "@/lib/repo";
import { parseMockSetting, resolveMockForced, resolveMockMode, type MockSetting, type Profile } from "./rules";

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

// One query loads every setting, so a page that reads the profile, the mock-mode override and
// more costs a single round trip per TTL instead of one per key.
function snapshot(): Map<string, Entry> {
  const hit = g.__studioSettings;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;
  try {
    const values = new Map<string, Entry>();
    for (const row of getRepo().listSettings()) values.set(row.key, { value: row.value, updatedAt: row.updatedAt });
    g.__studioSettings = { at: Date.now(), values };
    return values;
  } catch {
    // A failed read must not look like "nothing is set": that would flip a saved Live choice back to mock.
    // Keep serving the last good values (or none yet) and try again on the next call instead of caching the failure.
    return hit?.values ?? new Map();
  }
}

const read = (key: string): string | null => snapshot().get(key)?.value ?? null;

function write(key: string, value: string | null) {
  const repo = getRepo();
  if (value === null) repo.deleteSetting(key);
  else repo.setSetting(key, value);
  const values = new Map(snapshot());
  if (value === null) values.delete(key);
  else values.set(key, { value, updatedAt: new Date().toISOString() });
  g.__studioSettings = { at: Date.now(), values };
}

// --- mock-mode override ---

export function mockSetting(): MockSetting | null {
  return parseMockSetting(read("mockMode"));
}
export function setMockSetting(value: MockSetting | null) {
  write("mockMode", value);
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

export function saveProfile(profile: Profile) {
  write("profile", JSON.stringify(profile));
}

/** The name approvals and audit entries are recorded under. */
export const operatorName = () => getProfile().displayName;
