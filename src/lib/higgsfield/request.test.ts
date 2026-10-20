import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsImageUrls, buildRequestBody, normalizeAspectRatio, type RequestSpec } from "./request";

const SPEC: RequestSpec = { duration: 5, resolution: "720p", aspectRatios: ["16:9", "9:16", "1:1"] };

test("a model without a spec keeps the original body shape", () => {
  assert.deepEqual(buildRequestBody(undefined, { prompt: "p" }), { prompt: "p" });
  assert.deepEqual(buildRequestBody(undefined, { prompt: "p", imageUrls: ["u"] }), { prompt: "p", image_urls: ["u"] });
});

test("a spec sends exactly its documented fields", () => {
  assert.deepEqual(buildRequestBody(SPEC, { prompt: "A cinematic scene at sunset" }), {
    prompt: "A cinematic scene at sunset",
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
  });
});

test("the deliverable's aspect ratio is used when the model allows it, otherwise the first allowed one", () => {
  assert.equal(buildRequestBody(SPEC, { prompt: "p", aspectRatio: "9:16" }).aspect_ratio, "9:16");
  assert.equal(buildRequestBody(SPEC, { prompt: "p", aspectRatio: "1080x1920" }).aspect_ratio, "16:9");
  assert.equal(buildRequestBody(SPEC, { prompt: "p", aspectRatio: "21:9" }).aspect_ratio, "16:9");
  assert.equal(buildRequestBody(SPEC, { prompt: "p", aspectRatio: null }).aspect_ratio, "16:9");
});

test("fields a spec does not mention are not sent, and image urls are not sent to a spec model", () => {
  const body = buildRequestBody({ duration: 5, aspectRatios: ["16:9"] }, { prompt: "p", imageUrls: ["u"] });
  assert.deepEqual(body, { prompt: "p", duration: 5, aspect_ratio: "16:9" });
  assert.equal("resolution" in body, false);
});

test("extra fixed fields are merged in", () => {
  assert.equal(buildRequestBody({ extra: { generate_audio: false } }, { prompt: "p" }).generate_audio, false);
});

test("normalizeAspectRatio accepts common spellings", () => {
  assert.equal(normalizeAspectRatio("16x9"), "16:9");
  assert.equal(normalizeAspectRatio("9 : 16"), "9:16");
  assert.equal(normalizeAspectRatio("4/5"), "4:5");
  assert.equal(normalizeAspectRatio("wide"), null);
  assert.equal(normalizeAspectRatio(null), null);
});

test("only models without a body spec take reference images", () => {
  assert.equal(acceptsImageUrls(undefined), true);
  assert.equal(acceptsImageUrls({ duration: 5 }), false);
  assert.equal(acceptsImageUrls({ duration: 5, imageField: "image_url" }), true);
});

test("imageField puts the first reference image into the body", () => {
  const spec: RequestSpec = { duration: 5, imageField: "image_url" };
  assert.deepEqual(buildRequestBody(spec, { prompt: "p", imageUrls: ["https://a/1.png", "https://a/2.png"] }), { prompt: "p", duration: 5, image_url: "https://a/1.png" });
  assert.deepEqual(buildRequestBody(spec, { prompt: "p" }), { prompt: "p", duration: 5 });
});
