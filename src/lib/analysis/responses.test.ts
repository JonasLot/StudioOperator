import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOutputText, parseOutputJson } from "./responses";
import { safeParseAnalysis } from "./schema";

test("extracts top-level output_text", () => {
  assert.equal(extractOutputText({ output_text: "hello" }), "hello");
});

test("extracts and concatenates nested message content", () => {
  const body = { output: [{ type: "message", content: [{ type: "output_text", text: "a" }, { type: "output_text", text: "b" }] }] };
  assert.equal(extractOutputText(body), "ab");
});

test("throws on a response with no output text", () => {
  assert.throws(() => extractOutputText({}), /no output text/i);
  assert.throws(() => extractOutputText({ output: [] }), /no output text/i);
});

test("throws, surfacing an API error payload", () => {
  assert.throws(() => extractOutputText({ error: "rate_limited" }), /rate_limited/);
});

test("parseOutputJson throws on malformed JSON", () => {
  assert.throws(() => parseOutputJson("{not json"), /valid JSON/i);
});

test("end-to-end: extract -> parse -> validate a good payload", () => {
  const analysis = {
    jobType: "Stills",
    conciseSummary: "Six product stills.",
    deliverables: [{ name: "6 stills", format: "still image", aspectRatio: "4:5", duration: null, resolution: "4K", exactTextRequirements: [] }],
    suppliedAssets: ["shoot.zip"],
    missingAssets: [],
    questionsForClient: [],
    brandConstraints: [],
    rightsAndConsentFlags: [],
    technicalRisks: [],
    revisionRisk: "low",
    confidence: 70,
    decision: "accept",
    decisionReasons: ["clear"],
    proposedWorkflow: [{ capability: "image_keyframes", description: "stills" }],
    estimatedAttemptsByStep: [12],
    assumptions: [],
  };
  const body = { output_text: JSON.stringify(analysis) };
  const parsed = safeParseAnalysis(parseOutputJson(extractOutputText(body)));
  assert.equal(parsed.ok, true);
});

test("end-to-end: a malformed-but-JSON payload fails validation, not parsing", () => {
  const body = { output_text: JSON.stringify({ jobType: "x" }) }; // missing most fields
  const text = extractOutputText(body);
  const json = parseOutputJson(text); // parses fine
  const parsed = safeParseAnalysis(json); // but fails validation
  assert.equal(parsed.ok, false);
});
