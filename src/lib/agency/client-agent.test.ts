import { test } from "node:test";
import assert from "node:assert/strict";
import { assetRequests, channelFor, interpretRevision, missingQuestions } from "./client-agent";

test("missingQuestions keeps only material questions and adds a rights ask", () => {
  const qs = missingQuestions({
    missingInformation: [
      "Aspect ratio / delivery resolution not specified.",
      "Number of included revision rounds not agreed.",
      "Something vague and immaterial.",
    ],
    rightsConcerns: ["Licensed music — client must supply cleared music."],
  });
  const cats = qs.map((q) => q.category);
  assert.ok(cats.includes("quality"));
  assert.ok(cats.includes("cost"));
  assert.ok(cats.includes("rights")); // added from rightsConcerns
  // the immaterial note produced no question
  assert.ok(!qs.some((q) => /vague|immaterial/i.test(q.question)));
});

test("assetRequests always asks for likes and dislikes, and consent when a voice/likeness is in play", () => {
  const reqs = assetRequests({
    summary: "Brand film with a logo and product",
    brandConstraints: ["Use the wordmark only"],
    exactText: ["Built for the long night."],
    rightsConcerns: ["Voice resembling a specific person — requires consent."],
    deliverables: [{ id: "D1", kind: "still", title: "Stills", quantity: 3, durationSec: null, aspectRatio: null, resolution: null }],
    references: [],
  });
  const labels = reqs.map((r) => r.asset);
  assert.ok(labels.includes("Examples you like"));
  assert.ok(labels.includes("Examples you dislike"));
  assert.ok(labels.includes("Voice / likeness consent"));
  assert.ok(labels.includes("Product image or reference"));
});

test("interpretRevision: warmer/more hopeful is an included finishing edit", () => {
  const r = interpretRevision("Make the final reveal warmer and more hopeful.", { includedRemaining: 2 });
  assert.equal(r.affectedStep, "finishing");
  assert.equal(r.kind, "included");
});

test("interpretRevision: adding a new cut is a scope change", () => {
  const r = interpretRevision("Also need a 6s cutdown for YouTube pre-roll.", { includedRemaining: 2 });
  assert.equal(r.kind, "scope_change");
});

test("interpretRevision: no included rounds left becomes a change order", () => {
  const r = interpretRevision("Nudge the grade cooler.", { includedRemaining: 0 });
  assert.equal(r.kind, "scope_change");
});

test("channelFor: marketplaces vs direct", () => {
  assert.equal(channelFor("upwork"), "marketplace");
  assert.equal(channelFor("fiverr"), "marketplace");
  assert.equal(channelFor("email"), "direct_email");
  assert.equal(channelFor("direct"), "direct_email");
});
