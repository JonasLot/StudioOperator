import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Pure helpers for keys entered on the Settings page.
//
// Keys are stored encrypted (AES-256-GCM) in the database. The encryption key is
// derived from ADMIN_PASSCODE, so a copy of the database alone is not enough to
// read them, and changing the passcode makes old values unreadable (they are then
// treated as not set). No "server-only" / "@/..." imports so tests can use it.
// ---------------------------------------------------------------------------

export const MIN_PASSCODE_LENGTH = 12;
const SALT = "studio-operator/app-secrets/v1";

const keyCache = new Map<string, Buffer>();
function deriveKey(passcode: string): Buffer {
  let key = keyCache.get(passcode);
  if (!key) {
    key = scryptSync(passcode, SALT, 32);
    keyCache.set(passcode, key);
  }
  return key;
}

export function encryptSecret(plain: string, passcode: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passcode), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

/** The plaintext, or null when the blob is malformed or the passcode is wrong. */
export function decryptSecret(blob: string, passcode: string): string | null {
  const [version, iv, tag, ct] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(passcode), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Constant-time comparison (digests have equal length, so nothing leaks about the expected length). */
export function passcodeMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** "••••abcd" for a long key, just dots for a short one. Never reveals more than the last four characters. */
export function maskSecret(value: string): string {
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••";
}

/** Pasted keys often arrive wrapped in quotes or with a stray newline; reject what no real key contains. */
export function cleanSecretInput(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/^["']+|["']+$/g, "");
  if (value.length < 8) return { ok: false, error: "That looks too short to be an API key." };
  if (value.length > 512) return { ok: false, error: "That is too long to be an API key." };
  if (/\s/.test(value)) return { ok: false, error: "A key can't contain spaces or line breaks — paste just the key." };
  return { ok: true, value };
}

/** An API key read from an environment variable: strip the quotes and stray whitespace a dashboard paste often adds. */
export function cleanEnvSecret(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, "");
}

/** Non-secret facts about a credential, for diagnosing a rejected key. Never includes the value itself. */
export function describeKeyShape(value: string): { length: number; hasColon: boolean; hasWhitespace: boolean; hasQuote: boolean } {
  return { length: value.length, hasColon: value.includes(":"), hasWhitespace: /\s/.test(value), hasQuote: /["']/.test(value) };
}

/**
 * Higgsfield hands out "KEY_ID:KEY_SECRET" and the SDK takes it as one string, so it is easy to paste the whole
 * thing into one field. Undo that: a secret that starts with "<id>:" loses the prefix, a secret holding a combined
 * value with no ID set supplies both, and a combined value in the ID field with no secret is split. Anything
 * else (including a secret that genuinely contains a colon) is left alone.
 */
export function normalizeHiggsfieldPair(id: string, secret: string): { id: string; secret: string } {
  if (secret && id && secret.startsWith(`${id}:`)) return { id, secret: secret.slice(id.length + 1) };
  const split = (combined: string) => {
    const i = combined.indexOf(":");
    return i > 0 && i < combined.length - 1 ? { id: combined.slice(0, i), secret: combined.slice(i + 1) } : null;
  };
  if (secret && !id) return split(secret) ?? { id, secret };
  if (id && !secret) return split(id) ?? { id, secret };
  return { id, secret };
}
