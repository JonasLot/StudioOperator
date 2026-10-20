import "server-only";
import { getRepo } from "@/lib/repo";
import { cleanEnvSecret, cleanSecretInput, decryptSecret, encryptSecret, MIN_PASSCODE_LENGTH, maskSecret, passcodeMatches } from "./crypto";

// ---------------------------------------------------------------------------
// API keys that can be entered on the Settings page.
//
// A key saved in the UI overrides the environment variable of the same purpose;
// removing it falls back to the environment. Values are encrypted at rest with a
// key derived from ADMIN_PASSCODE, and are write-only: nothing here ever returns a
// stored value to a page — only whether one is set, where it comes from, and its
// last four characters.
// ---------------------------------------------------------------------------

export type SecretName = "openaiApiKey" | "hfApiKeyId" | "hfApiKeySecret" | "draftApiKey";

export const SECRET_DEFS: Record<SecretName, { label: string; description: string; env: string[] }> = {
  openaiApiKey: {
    label: "OpenAI API key",
    description: "Brief analysis (GPT-6 Astra). Without it the offline analyzer is used.",
    env: ["OPENAI_API_KEY", "ASTRA_API_KEY"],
  },
  draftApiKey: {
    label: "First-phase AI key (optional)",
    description: "Only for hosted endpoints such as OpenRouter. A local model (Ollama, LM Studio) needs none.",
    env: ["DRAFT_AI_API_KEY"],
  },
  hfApiKeyId: {
    label: "Higgsfield API key ID",
    description: "Generation provider, together with the secret below.",
    env: ["HF_API_KEY_ID", "HIGGSFIELD_API_KEY_ID"],
  },
  hfApiKeySecret: {
    label: "Higgsfield API key secret",
    description: "Pairs with the key ID. Both are needed for live generation. Paste only the secret, not the combined ID:SECRET.",
    env: ["HF_API_KEY_SECRET", "HIGGSFIELD_API_KEY_SECRET"],
  },
};
export const SECRET_NAMES = Object.keys(SECRET_DEFS) as SecretName[];

/** The admin passcode, or null when it is missing or too short to protect anything. */
export function adminPasscode(): string | null {
  const p = (process.env.ADMIN_PASSCODE ?? "").trim();
  return p.length >= MIN_PASSCODE_LENGTH ? p : null;
}

export function verifyAdminPasscode(input: string): boolean {
  const expected = adminPasscode();
  return expected !== null && passcodeMatches(input, expected);
}

function envValue(name: SecretName): string {
  for (const key of SECRET_DEFS[name].env) {
    const value = cleanEnvSecret(process.env[key]);
    if (value) return value;
  }
  return "";
}

// Config is read on every provider call, so keep the decrypted values for a short
// while; saving here refreshes immediately, other instances catch up within the TTL.
const TTL_MS = 15_000;
// Held on globalThis so every copy of this module (dev reloads, separate bundles) shares one cache.
type Cache = { at: number; values: Partial<Record<SecretName, string>> } | undefined;
const g = globalThis as unknown as { __studioSecretCache?: Cache };

/** What is currently cached; a synchronous read, so config getters can use it. See refreshSecrets(). */
function stored(): Partial<Record<SecretName, string>> {
  return g.__studioSecretCache?.values ?? {};
}

/**
 * Reload the saved keys from the database when the cache is older than the TTL. The database is async,
 * but `config.openai.apiKey` and friends are synchronous getters, so every entry point (page, server
 * action) calls this once first (see loadRuntimeConfig); the getters then read the cache.
 */
export async function refreshSecrets(): Promise<void> {
  const cache = g.__studioSecretCache;
  if (cache && Date.now() - cache.at < TTL_MS) return;
  const pass = adminPasscode();
  const values: Partial<Record<SecretName, string>> = {};
  if (pass) {
    try {
      for (const row of await getRepo().listSecrets()) {
        if (!(row.name in SECRET_DEFS)) continue;
        const plain = decryptSecret(row.value, pass);
        if (plain) values[row.name as SecretName] = plain;
      }
    } catch {
      return; // database unreachable: keep serving the last good values and retry on the next call
    }
  }
  g.__studioSecretCache = { at: Date.now(), values };
}

/** The effective value: a key saved in the UI wins over the environment variable. */
export function secretValue(name: SecretName): string {
  return stored()[name] || envValue(name);
}

export type SecretStatus = { name: SecretName; label: string; description: string; source: "settings" | "environment" | "none"; hint: string | null };

export function secretStatus(): SecretStatus[] {
  const s = stored();
  return SECRET_NAMES.map((name) => {
    const fromSettings = s[name];
    const fromEnv = envValue(name);
    const value = fromSettings || fromEnv;
    return {
      name,
      label: SECRET_DEFS[name].label,
      description: SECRET_DEFS[name].description,
      source: fromSettings ? "settings" : fromEnv ? "environment" : "none",
      hint: value ? maskSecret(value) : null,
    };
  });
}

export type SaveSecretsResult = { ok: true; saved: SecretName[]; removed: SecretName[] } | { ok: false; error: string };

/** Validate and persist. `updates` holds new values (blank = leave alone); `remove` reverts a key to its environment value. */
export async function saveSecrets(updates: Partial<Record<SecretName, string>>, remove: SecretName[]): Promise<SaveSecretsResult> {
  const pass = adminPasscode();
  if (!pass) return { ok: false, error: "ADMIN_PASSCODE is not configured on the server." };
  const toSave: [SecretName, string][] = [];
  for (const name of SECRET_NAMES) {
    const raw = updates[name];
    if (raw === undefined || raw.trim() === "") continue;
    const cleaned = cleanSecretInput(raw);
    if (!cleaned.ok) return { ok: false, error: `${SECRET_DEFS[name].label}: ${cleaned.error}` };
    toSave.push([name, cleaned.value]);
  }
  const repo = getRepo();
  await repo.transaction(async () => {
    for (const [name, value] of toSave) await repo.upsertSecret(name, encryptSecret(value, pass));
    for (const name of remove) await repo.deleteSecret(name);
  });
  g.__studioSecretCache = undefined;
  await refreshSecrets();
  return { ok: true, saved: toSave.map(([n]) => n), removed: remove };
}

/** True when the database is durable across serverless instances (Postgres or a remote Turso database). */
export function storageIsDurable(): boolean {
  return !!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.TURSO_DATABASE_URL ?? "").trim();
}
