import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Signed session cookie (stateless).
//
// The studio has one operator, who signs in with ADMIN_PASSCODE. A session is
// `payload.signature` where the signature is an HMAC-SHA256 under a key derived
// from the passcode, so rotating the passcode signs everyone out. Nothing secret
// is inside the token. Pure module (node:crypto only) so the proxy and tests can
// import it directly.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "studio_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  v: 1;
  iat: number; // seconds since epoch
  exp: number;
}

function key(passcode: string) {
  return createHash("sha256").update(`studio-operator/session/v1\0${passcode}`).digest();
}

function sign(body: string, passcode: string) {
  return createHmac("sha256", key(passcode)).update(body).digest("base64url");
}

export function signSession(passcode: string, nowMs = Date.now(), ttlSeconds = SESSION_TTL_SECONDS): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { v: 1, iat, exp: iat + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, passcode)}`;
}

export function verifySession(token: string | null | undefined, passcode: string, nowMs = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, passcode));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (p.v !== 1 || typeof p.iat !== "number" || typeof p.exp !== "number") return null;
    if (p.exp * 1000 <= nowMs || p.iat * 1000 > nowMs + 60_000) return null;
    return p as SessionPayload;
  } catch {
    return null;
  }
}

/** Only ever redirect to a path inside this app (never an absolute URL, and not back to /login). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return "/";
  return next;
}
