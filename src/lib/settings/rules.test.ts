import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, parseMockSetting, resolveMockForced, resolveMockMode, validateProfile } from "./rules";

test("mock mode: an explicit choice wins, otherwise the environment decides", () => {
  assert.equal(resolveMockMode("mock", "false"), true);
  assert.equal(resolveMockMode("live", undefined), false);
  assert.equal(resolveMockMode(null, undefined), true); // unset env = mock
  assert.equal(resolveMockMode(null, "false"), false);
  assert.equal(resolveMockMode(null, "true"), true);
});

test("mock forced: analysis stays live with a key unless explicitly forced to mock", () => {
  assert.equal(resolveMockForced(null, undefined), false);
  assert.equal(resolveMockForced(null, "true"), true);
  assert.equal(resolveMockForced("mock", undefined), true);
  assert.equal(resolveMockForced("live", "true"), false);
});

test("parseMockSetting ignores anything unexpected", () => {
  assert.equal(parseMockSetting("mock"), "mock");
  assert.equal(parseMockSetting("live"), "live");
  assert.equal(parseMockSetting("yes"), null);
  assert.equal(parseMockSetting(null), null);
});

test("validateProfile trims, requires names and checks the email", () => {
  const ok = validateProfile({ displayName: "  Ada   Lovelace ", studioName: "North Studio", email: "" });
  assert.deepEqual(ok, { ok: true, value: { displayName: "Ada Lovelace", studioName: "North Studio", email: "" } });
  const bad = validateProfile({ displayName: "", studioName: "x".repeat(61), email: "nope" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["displayName", "email", "studioName"]);
});

test("initials", () => {
  assert.equal(initials("Ada Lovelace"), "AL");
  assert.equal(initials("operator"), "O");
  assert.equal(initials("  "), "?");
});
