import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTakePrompt, extractVariables, parseTags, renderPrompt, validatePrompt } from "./library";

test("variables are found once, in order, case-insensitively", () => {
  assert.deepEqual(extractVariables("A {{tone}} shot of {{ Product }} in {{tone}} light"), ["tone", "product"]);
  assert.deepEqual(extractVariables("no variables, {single} braces"), []);
});

test("render fills known variables and leaves unknown or empty ones visible", () => {
  const out = renderPrompt("{{logline}}. Tone: {{tone}}. Product: {{product}}. Look: {{visual_direction}}", { logline: "A bottle at dawn", tone: "calm", visual_direction: "  " });
  assert.equal(out, "A bottle at dawn. Tone: calm. Product: {{product}}. Look: {{visual_direction}}");
});

test("a take prompt loses its take number but keeps everything else", () => {
  const sent = "Make the hero shot\nInputs: keyframes\nBrief: a launch film\nTake 3.";
  assert.equal(cleanTakePrompt(sent), "Make the hero shot\nInputs: keyframes\nBrief: a launch film");
  assert.equal(cleanTakePrompt("x\nOperator-requested retry.\nTake 12."), "x\nOperator-requested retry.");
});

test("tags are lowercased, de-duplicated and limited", () => {
  assert.deepEqual(parseTags("Product Shot, product shot,  Hero!, "), ["product-shot", "hero"]);
  assert.equal(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 8);
});

test("validation reports each problem and trims good input", () => {
  const bad = validatePrompt({ name: " ", category: "audio", body: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["body", "category", "name"]);
  const ok = validatePrompt({ name: "  Hero   shot ", category: "video", modelId: "", tags: "hero, 4k", body: " Slow orbit around {{product}} ", notes: "" });
  assert.deepEqual(ok, { ok: true, value: { name: "Hero shot", category: "video", modelId: null, tags: ["hero", "4k"], body: "Slow orbit around {{product}}", notes: null } });
});
