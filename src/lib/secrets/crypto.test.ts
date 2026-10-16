import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSecretInput, decryptSecret, encryptSecret, maskSecret, passcodeMatches } from "./crypto";

const PASS = "correct horse battery staple";

test("encrypt then decrypt round-trips and never stores plaintext", () => {
  const blob = encryptSecret("sk-live-1234567890abcdef", PASS);
  assert.ok(!blob.includes("sk-live"));
  assert.equal(decryptSecret(blob, PASS), "sk-live-1234567890abcdef");
});

test("each encryption uses a fresh IV", () => {
  assert.notEqual(encryptSecret("sk-same-value-1234", PASS), encryptSecret("sk-same-value-1234", PASS));
});

test("a wrong passcode or tampered blob reads as not set", () => {
  const blob = encryptSecret("sk-live-1234567890abcdef", PASS);
  assert.equal(decryptSecret(blob, "a different passcode!"), null);
  const parts = blob.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.equal(decryptSecret(parts.join("."), PASS), null);
  assert.equal(decryptSecret("garbage", PASS), null);
});

test("passcodeMatches is exact", () => {
  assert.equal(passcodeMatches(PASS, PASS), true);
  assert.equal(passcodeMatches(PASS + " ", PASS), false);
  assert.equal(passcodeMatches("", PASS), false);
});

test("maskSecret reveals at most the last four characters", () => {
  assert.equal(maskSecret("sk-live-1234567890abcdef"), "••••cdef");
  assert.equal(maskSecret("short"), "••••");
});

test("cleanSecretInput strips wrapping quotes and rejects bad input", () => {
  assert.deepEqual(cleanSecretInput('  "sk-abc12345"\n'), { ok: true, value: "sk-abc12345" });
  assert.equal(cleanSecretInput("abc").ok, false);
  assert.equal(cleanSecretInput("sk-abc 12345").ok, false);
  assert.equal(cleanSecretInput("x".repeat(600)).ok, false);
});
