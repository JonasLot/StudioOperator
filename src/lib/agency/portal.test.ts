import assert from "node:assert/strict";
import test from "node:test";
import type { BriefView, ClientFeedback, Generation, Workflow } from "@/lib/domain/types";
import { cleanText, isClientVisible, portalBrief, portalDeliveries, portalQuestions, portalStages, tooManyRecent, waitingOnClient } from "./portal";

const gen = (o: Partial<Generation>): Generation =>
  ({ id: "g1", jobId: "j", workflowId: "w", stepId: "s1", revisionId: null, attempt: 1, provider: "mock", providerRequestId: null, statusUrl: null, model: "m", prompt: "SECRET PROMPT", status: "completed", costEstimate: 1, actualCost: 1, outputUrl: "/api/asset/a1", outputType: "video", selected: true, reviewStatus: "approved", reviewNote: null, error: null, timedOutAt: null, createdAt: "t", startedAt: null, completedAt: null, ...o }) as Generation;

const fb = (o: Partial<ClientFeedback>): ClientFeedback => ({ id: "f", jobId: "j", kind: "comment", ref: null, body: "x", revisionId: null, createdAt: "2026-01-01T00:00:00.000Z", ...o });

const brief = {
  id: "a", jobId: "j", analyzer: "x", decision: "accept", rationale: ["internal"], createdAt: "t",
  summary: "A 30s film", deliverables: [{ id: "D1", kind: "film", title: "Hero film", quantity: 1, durationSec: 30, aspectRatio: "16:9", resolution: "4K" }],
  dimensions: [], durations: [], references: [], exactText: ["Buy now"], brandConstraints: ["Warm tones"],
  rightsConcerns: ["Uses a real voice"], missingInformation: ["Final delivery format and aspect ratio unknown"], confidence: 0.4,
} as unknown as BriefView;

const wf = { steps: [{ id: "s1", deliverableIds: ["D1"] }] } as unknown as Workflow;

test("stages follow the job status and hide closed jobs", () => {
  assert.deepEqual(portalStages("qa")!.map((s) => s.state), ["done", "done", "done", "current", "upcoming"]);
  assert.equal(portalStages("new")![0].state, "current");
  assert.equal(portalStages("delivered")![4].state, "current");
  assert.equal(portalStages("rejected"), null);
});

test("the client brief is an allow-list: no rights, gaps, confidence or rationale", () => {
  const out = JSON.stringify(portalBrief(brief));
  assert.match(out, /Hero film/);
  assert.match(out, /Buy now/);
  assert.doesNotMatch(out, /real voice|unknown|0\.4|internal/);
});

test("only operator-approved, finished takes are visible", () => {
  assert.equal(isClientVisible(gen({})), true);
  assert.equal(isClientVisible(gen({ reviewStatus: "pending" })), false);
  assert.equal(isClientVisible(gen({ reviewStatus: "rejected" })), false);
  assert.equal(isClientVisible(gen({ status: "in_progress" })), false);
  assert.equal(isClientVisible(gen({ outputUrl: null })), false);
});

test("deliveries carry a title and the client's latest response, never prompts or costs", () => {
  const list = portalDeliveries([gen({}), gen({ id: "g2", reviewStatus: "pending" })], wf, brief, [
    fb({ kind: "change", ref: "g1", body: "Warmer", createdAt: "2026-01-01T00:00:00.000Z" }),
    fb({ kind: "approve", ref: "g1", createdAt: "2026-01-02T00:00:00.000Z" }),
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Hero film");
  assert.equal(list[0].response?.kind, "approve");
  assert.doesNotMatch(JSON.stringify(list), /SECRET PROMPT|costEstimate|actualCost/);
});

test("placeholders from mock mode are flagged", () => {
  assert.equal(portalDeliveries([gen({ outputUrl: "/api/mock-output/g1" })], wf, brief, [])[0].placeholder, true);
});

test("questions are keyed by their text and pick up the latest answer", () => {
  const q = portalQuestions(brief, []);
  assert.ok(q.length >= 1 && q[0].answer === null);
  const answered = portalQuestions(brief, [fb({ kind: "answer", ref: q[0].question, body: "16:9, 4K" })]);
  assert.equal(answered[0].answer, "16:9, 4K");
});

test("nothing waits on the client once delivered", () => {
  const q = [{ question: "?", answer: null }];
  assert.deepEqual(waitingOnClient(q, [], "qa"), { questions: 1, reviews: 0 });
  assert.deepEqual(waitingOnClient(q, [], "delivered"), { questions: 0, reviews: 0 });
});

test("free text is trimmed and bounded", () => {
  assert.equal(cleanText("   "), null);
  assert.equal(cleanText(42), null);
  assert.equal(cleanText("  hi  "), "hi");
  assert.equal(cleanText("x".repeat(5000))!.length, 2000);
});

test("rate guard counts only the last minute", () => {
  const now = Date.parse("2026-01-01T00:10:00.000Z");
  const recent = Array.from({ length: 10 }, () => ({ createdAt: "2026-01-01T00:09:30.000Z" }));
  assert.equal(tooManyRecent(recent, now), true);
  assert.equal(tooManyRecent(recent.slice(0, 9), now), false);
  assert.equal(tooManyRecent(recent.map(() => ({ createdAt: "2026-01-01T00:05:00.000Z" })), now), false);
});
