import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, pickOutput, sizeForRatio, unfilledPlaceholders } from "./workflow";

test("fillTemplate keeps numbers numeric and substitutes inside text", () => {
  const out = fillTemplate({ a: { text: "{{prompt}}", seed: "{{seed}}", w: "{{width}}", label: "take {{seed}}" }, link: ["1", 0] }, { prompt: "a cat", seed: 7, width: 512 });
  assert.deepEqual(out, { a: { text: "a cat", seed: 7, w: 512, label: "take 7" }, link: ["1", 0] });
});

test("unfilledPlaceholders reports unknown names", () => {
  assert.deepEqual(unfilledPlaceholders(fillTemplate({ x: "{{prompt}}", y: "{{oops}}" }, { prompt: "p" })), ["oops"]);
});

test("sizeForRatio sets the long side and snaps to multiples of 8", () => {
  assert.deepEqual(sizeForRatio("16:9", 1024), { width: 1024, height: 576 });
  assert.deepEqual(sizeForRatio("9:16", 1024), { width: 576, height: 1024 });
  assert.deepEqual(sizeForRatio(null, 1024), { width: 1024, height: 1024 });
});

test("pickOutput prefers saved outputs and video containers", () => {
  const outputs = { "3": { images: [{ filename: "tmp.png", type: "temp" }] }, "9": { gifs: [{ filename: "clip.mp4", type: "output" }] } };
  assert.equal(pickOutput(outputs, "video")?.filename, "clip.mp4");
  assert.equal(pickOutput(outputs, "image")?.filename, "tmp.png");
  assert.equal(pickOutput({}, "image"), null);
});
