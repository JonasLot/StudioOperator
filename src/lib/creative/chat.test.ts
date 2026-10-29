import { test } from "node:test";
import assert from "node:assert/strict";
import { extractChatText, extractModelIds, isModelNotFound, parseJsonLoose, stripThinking } from "./chat";

const body = (content: string) => ({ choices: [{ message: { content } }] });

test("extractChatText drops an inline <think> block before the answer", () => {
  const text = extractChatText(body('<think>The client wants {a jacket}…</think>\n{"logline":"Polar launch"}'));
  assert.deepEqual(parseJsonLoose(text), { logline: "Polar launch" });
});

test("extractChatText treats an answer that is only unfinished thinking as empty", () => {
  assert.throws(() => extractChatText(body("<think>still going")), /no message content/);
});

test("stripThinking leaves plain answers alone", () => {
  assert.equal(stripThinking("  A wet slate, studio light.  "), "A wet slate, studio light.");
});

test("extractModelIds reads an OpenAI-style /models list, deduplicated and sorted", () => {
  assert.deepEqual(extractModelIds({ object: "list", data: [{ id: "qwen3.5:latest" }, { id: "gemma4:latest" }, { id: "gemma4:latest" }, { nope: 1 }] }), ["gemma4:latest", "qwen3.5:latest"]);
  assert.deepEqual(extractModelIds({ error: "x" }), []);
});

test("isModelNotFound recognises Ollama's 404", () => {
  assert.ok(isModelNotFound(404, `{"error":{"message":"model 'llama3.2' not found","type":"not_found_error"}}`));
  assert.ok(!isModelNotFound(500, "model 'llama3.2' not found"));
  assert.ok(!isModelNotFound(404, "page not found"));
});
