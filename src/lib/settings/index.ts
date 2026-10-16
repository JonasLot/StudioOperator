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
type Snapshot = { at: number; values: Map<string, string> };
const g = globalThis as unknown as { __studioSettings?: Snapshot };

// One query loads every setting, so a page that reads the profile, the mock-mode override and
// more costs a single round trip per TTL instead of one per key.
function snapshot(): Map<string, string> {
  const hit = g.__studioSettings;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;
  const values = new Map<string, string>();
  try {
    for (const row of getRepo().listSettings()) values.set(row.key, row.value);
  } catch {
    /* database not reachable yet — behave as if nothing is set */
  }
  g.__studioSettings = { at: Date.now(), values };
  return values;
}

const read = (key: string): string | null => snapshot().get(key) ?? null;

function write(key: string, value: string | null) {
  const repo = getRepo();
  if (value === null) repo.deleteSetting(key);
  else repo.setSetting(key, value);
  const values = new Map(snapshot());
  if (value === null) values.delete(key);
  else values.set(key, value);
  g.__studioSettings = { at: Date.now(), values };
}

// --- mock-mode override ---

export function mockSetting(): MockSetting | null {
  return parseMockSetting(read("mockMode"));
}
export function setMockSetting(value: MockSetting | null) {
  write("mockMode", value);
}
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
