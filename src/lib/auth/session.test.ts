import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, signSession, verifySession } from "./session";
import { MAX_FAILURES, WINDOW_MS, afterFailure, blockedForMs } from "./throttle";

const PASS = "correct horse battery staple";
const NOW = 1_800_000_000_000;

test("a signed session verifies and carries its lifetime", () => {
  const token = signSession(PASS, NOW, 3600);
  const s = verifySession(token, PASS, NOW + 1000);
  assert.ok(s);
  assert.equal(s!.exp - s!.iat, 3600);
});

test("expired, tampered or wrong-passcode sessions are rejected", () => {
  const token = signSession(PASS, NOW, 3600);
  assert.equal(verifySession(token, PASS, NOW + 3601 * 1000), null);
  assert.equal(verifySession(token, "another passcode entirely", NOW), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ v: 1, iat: 1, exp: 9_999_999_999 })).toString("base64url");
  assert.equal(verifySession(`${forged}.${sig}`, PASS, NOW), null);
  assert.equal(verifySession(`${body}.${sig}x`, PASS, NOW), null);
  assert.equal(verifySession(`${token}.extra`, PASS, NOW), null);
  assert.equal(verifySession("", PASS, NOW), null);
  assert.equal(verifySession(undefined, PASS, NOW), null);
});

test("a session from the future is not accepted", () => {
  const token = signSession(PASS, NOW + 3_600_000, 3600);
  assert.equal(verifySession(token, PASS, NOW), null);
});

test("safeNextPath only allows in-app paths", () => {
  assert.equal(safeNextPath("/jobs/abc?tab=costs"), "/jobs/abc?tab=costs");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/login?next=/x"), "/");
  assert.equal(safeNextPath(null), "/");
});

test("throttle blocks after repeated failures and frees after the window", () => {
  let state = null as ReturnType<typeof afterFailure> | null;
  for (let i = 0; i < MAX_FAILURES - 1; i++) state = afterFailure(state, NOW + i);
  assert.equal(blockedForMs(state, NOW + 100), 0);
  state = afterFailure(state, NOW + 200);
  assert.ok(blockedForMs(state, NOW + 1000) > 0);
  assert.equal(blockedForMs(state, NOW + WINDOW_MS + 1), 0);
  assert.deepEqual(afterFailure(state, NOW + WINDOW_MS + 1).failures, 1);
});
