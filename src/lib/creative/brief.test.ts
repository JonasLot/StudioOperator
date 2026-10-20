import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_BRIEF, changedFields, coerceBrief, creativeDirectionText } from "./brief";
import { extractChatText, parseJsonLoose } from "./chat";
import { mockDraft, mockSpar } from "./mock";

test("coerceBrief tolerates strings for lists, snake_case keys and duplicates", () => {
  const b = coerceBrief({ logline: "  A quiet launch  film ", visual_direction: "soft light", key_messages: "- Calm\n- calm\n- Honest", avoid: ["No people", "no people"] });
  assert.ok(b);
  assert.equal(b.logline, "A quiet launch film");
  assert.equal(b.visualDirection, "soft light");
  assert.deepEqual(b.keyMessages, ["Calm", "Honest"]);
  assert.deepEqual(b.avoid, ["No people"]);
});

test("a brief without a logline is rejected", () => {
  assert.equal(coerceBrief({ tone: "warm" }), null);
  assert.equal(coerceBrief("text"), null);
  assert.equal(coerceBrief(null), null);
});

test("creative direction leaves open questions out and skips empty fields", () => {
  const text = creativeDirectionText({ ...EMPTY_BRIEF, logline: "A glass monument at dusk", tone: "hopeful", avoid: ["people", "text overlays"], openQuestions: ["Who is it for?"] });
  assert.equal(text, "Creative direction: A glass monument at dusk\nTone: hopeful\nAvoid: people; text overlays");
  assert.equal(creativeDirectionText(EMPTY_BRIEF), "");
});

test("changedFields names only what differs", () => {
  const a = { ...EMPTY_BRIEF, logline: "x" };
  assert.deepEqual(changedFields(a, { ...a, tone: "warm", avoid: ["a"] }), ["tone", "avoid"]);
});

test("the offline drafter extracts from the client's words and flags what is missing", () => {
  const b = mockDraft({
    title: "Orchard",
    rawBrief: "A slow cinematic film of the orchard at night. The audience is design-minded homeowners. We must include the lantern. No people in frame.",
    clientNotes: null,
  });
  assert.match(b.logline, /orchard at night/i);
  assert.match(b.tone, /cinematic/);
  assert.ok(b.mustHaves.some((x) => /lantern/.test(x)));
  assert.ok(b.avoid.some((x) => /No people/.test(x)));
  assert.ok(b.audience.length > 0);
  assert.ok(!b.openQuestions.some((q) => /audience/i.test(q)));
});

test("offline sparring files the note under the right list and never drops existing content", () => {
  const base = { ...EMPTY_BRIEF, logline: "x", avoid: ["a"] };
  assert.deepEqual(mockSpar(base, "Don't show the logo").brief.avoid, ["a", "Don't show the logo"]);
  assert.deepEqual(mockSpar(base, "It must include the bottle").brief.mustHaves, ["It must include the bottle"]);
  assert.deepEqual(mockSpar(base, "Lead with the warmth").brief.keyMessages, ["Lead with the warmth"]);
  assert.equal(mockSpar(base, "  ").brief, base);
});

test("chat helpers read content, fenced JSON and embedded JSON", () => {
  assert.equal(extractChatText({ choices: [{ message: { content: "hi" } }] }), "hi");
  assert.throws(() => extractChatText({ choices: [] }), /Malformed/);
  assert.throws(() => extractChatText({ error: { message: "nope" } }), /returned an error/);
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! Here it is: {"a":1} hope it helps'), { a: 1 });
  assert.throws(() => parseJsonLoose("not json"), /not valid JSON/);
});
