import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getRepo } from "@/lib/repo";
import { adminPasscode } from "@/lib/secrets";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionPayload } from "./session";
import { afterFailure, blockedForMs, type AttemptState } from "./throttle";

// ---------------------------------------------------------------------------
// Sign-in for the whole app. The operator signs in with ADMIN_PASSCODE and gets a
// signed, httpOnly cookie. proxy.ts is the first gate (it redirects), but every
// server action also checks the session itself — the proxy is not the only defence.
// When ADMIN_PASSCODE is not configured there is nothing to sign in with, so the
// app stays open (the shell shows a warning) rather than locking everyone out.
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message = "Your session has ended. Please sign in again.") {
    super(message);
    this.name = "AuthError";
  }
}

export const authEnabled = () => adminPasscode() !== null;

export async function currentSession(): Promise<SessionPayload | null> {
  const pass = adminPasscode();
  if (!pass) return null;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, pass);
}

/** Signed in, or login is switched off. */
export async function isSignedIn(): Promise<boolean> {
  return !authEnabled() || (await currentSession()) !== null;
}

export async function requireSession(): Promise<void> {
  if (!(await isSignedIn())) throw new AuthError();
}

export async function startSession(): Promise<void> {
  const pass = adminPasscode();
  if (!pass) return;
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, signSession(pass), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_TTL_SECONDS });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

// --- throttling of wrong passcodes, per client, kept in the database ---

async function attemptKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return `login:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

function readAttempts(key: string): AttemptState | null {
  try {
    const raw = getRepo().getSetting(key);
    return raw ? (JSON.parse(raw) as AttemptState) : null;
  } catch {
    return null;
  }
}

/** Milliseconds this client must wait before trying again; 0 when allowed. */
export async function loginBlockedForMs(): Promise<number> {
  return blockedForMs(readAttempts(await attemptKey()), Date.now());
}

export async function recordLoginFailure(): Promise<void> {
  const key = await attemptKey();
  try {
    getRepo().setSetting(key, JSON.stringify(afterFailure(readAttempts(key), Date.now())));
  } catch {
    /* throttling is best-effort; the response delay still applies */
  }
}

export async function clearLoginFailures(): Promise<void> {
  try {
    getRepo().deleteSetting(await attemptKey());
  } catch {
    /* nothing to clear */
  }
}
