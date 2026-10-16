import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBriefFacts, deriveDeliverables, deliverableKind, parseDurationSec, parseQuantity } from "./view";
import { mockAnalyze } from "./mock";

test("parseDurationSec understands common forms", () => {
  assert.equal(parseDurationSec("60s"), 60);
  assert.equal(parseDurationSec("90 seconds"), 90);
  assert.equal(parseDurationSec("1 min"), 60);
  assert.equal(parseDurationSec("1:30"), 90);
  assert.equal(parseDurationSec("1m30s"), 90);
  assert.equal(parseDurationSec("20"), 20);
  assert.equal(parseDurationSec(null), null);
  assert.equal(parseDurationSec("TBC"), null);
});

test("parseQuantity reads counts but not durations", () => {
  assert.equal(parseQuantity("6 × stills"), 6);
  assert.equal(parseQuantity("3x product shots"), 3);
  assert.equal(parseQuantity("Three cover stills"), 3);
  assert.equal(parseQuantity("60 second film"), 1);
  assert.equal(parseQuantity("15s cutdown"), 1);
  assert.equal(parseQuantity("Hero film"), 1);
});

test("deliverableKind maps free-text formats", () => {
  assert.equal(deliverableKind({ name: "Hero film", format: "video", duration: "60s" }), "film");
  assert.equal(deliverableKind({ name: "Social spot", format: "video", duration: "15s" }), "social");
  assert.equal(deliverableKind({ name: "15s cutdown", format: "video", duration: "15s" }), "cutdown");
  assert.equal(deliverableKind({ name: "6 × stills", format: "still image", duration: null }), "still");
  assert.equal(deliverableKind({ name: "Voiceover", format: "voiceover", duration: null }), "voiceover");
  assert.equal(deliverableKind({ name: "Narration", format: "audio", duration: "20s" }), "voiceover");
});

test("deriveBriefFacts flattens an offline analysis of a rich brief", () => {
  const a = mockAnalyze({
    rawBrief:
      'Need a cinematic 60-second film in 16:9 4K plus two 15s cutdowns at 9:16. End card must read exactly: "Built for the long night." Brand logo on black. Voiceover reads the end line.',
    budget: 6000,
    deadline: "2030-01-01",
    source: "direct",
    referenceAssets: ["https://example.com/mood"],
    clientNotes: null,
  });
  const f = deriveBriefFacts(a);
  assert.deepEqual(f.deliverables.map((d) => d.id), f.deliverables.map((_, i) => `D${i + 1}`));
  const film = f.deliverables.find((d) => d.kind === "film");
  assert.equal(film?.durationSec, 60);
  assert.ok(f.deliverables.some((d) => d.kind === "cutdown"));
  assert.ok(f.deliverables.some((d) => d.kind === "voiceover"));
  assert.ok(f.exactText.includes("Built for the long night."));
  assert.ok(f.dimensions.includes("16:9") && f.dimensions.includes("4K"));
  assert.ok(f.rightsConcerns.some((r) => r.startsWith("Exact logo")));
  assert.ok(f.confidence > 0 && f.confidence <= 1);
});

test("deriveDeliverables numbers deliverables in order", () => {
  const d = deriveDeliverables({
    deliverables: [
      { name: "A", format: "video", aspectRatio: null, duration: "10s", resolution: null, exactTextRequirements: [] },
      { name: "B", format: "still image", aspectRatio: "1:1", duration: null, resolution: null, exactTextRequirements: [] },
    ],
  });
  assert.deepEqual(d.map((x) => x.id), ["D1", "D2"]);
});
