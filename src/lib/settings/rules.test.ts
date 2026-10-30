import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, parseDraftModel, parseMockSetting, resolveMockForced, resolveMockMode, validateDraftModel, validateProfile } from "./rules";

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
  const ok = validateProfile({ displayName: "  Ada   Lovelace ", studioName: "North Studio", email: "", billingDetails: "  North Studio AS \r\n\n\n\n Org 123  456 \n" });
  assert.deepEqual(ok, { ok: true, value: { displayName: "Ada Lovelace", studioName: "North Studio", email: "", billingDetails: "North Studio AS\n\nOrg 123 456" } });
  const bad = validateProfile({ displayName: "", studioName: "x".repeat(61), email: "nope" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["displayName", "email", "studioName"]);
});

test("initials", () => {
  assert.equal(initials("Ada Lovelace"), "AL");
  assert.equal(initials("operator"), "O");
  assert.equal(initials("  "), "?");
});

test("draft model: needs an http(s) address and a model name, and tidies the address", () => {
  assert.deepEqual(validateDraftModel({ baseUrl: " http://localhost:11434/v1/ ", model: " llama3.2 " }), { ok: true, value: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" } });
  const bad = validateDraftModel({ baseUrl: "localhost:11434", model: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["baseUrl", "model"]);
  assert.equal(validateDraftModel({ baseUrl: "https://user:pw@host/v1", model: "m" }).ok, false);
  assert.equal(validateDraftModel({ baseUrl: "ftp://host/v1", model: "m" }).ok, false);
});

test("a stored draft model that no longer validates reads as unset", () => {
  assert.equal(parseDraftModel(null), null);
  assert.equal(parseDraftModel("not json"), null);
  assert.deepEqual(parseDraftModel('{"baseUrl":"https://openrouter.ai/api/v1","model":"x/y"}'), { baseUrl: "https://openrouter.ai/api/v1", model: "x/y" });
});
