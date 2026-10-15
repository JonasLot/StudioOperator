import { z } from "zod";

// ---------------------------------------------------------------------------
// Structured brief analysis.
//
// This is the schema the model must fill (via OpenAI Structured Outputs) and
// the exact shape persisted to the database after validation. It is a PURE
// module (no "server-only", no "@/..." imports) so the deterministic layers
// and tests can import it directly.
//
// The model proposes a workflow by the *capability* each step needs — never a
// concrete model endpoint and never a price. Prices come from the application's
// catalog and the deterministic cost calculator (see cost.ts).
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
  "image_keyframes",
  "text_frames",
  "hero_video",
  "reference_video",
  "cutdown_video",
  "voiceover",
  "edit_assemble",
  "finishing",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Rights / consent flag kinds that must route a job to a human.
export const CONSENT_FLAG_KINDS = [
  "logo",
  "packaging_text",
  "person_likeness",
  "person_voice",
  "factual_claim",
  "licensed_music",
  "unclear_rights",
  "impersonation",
  "other",
] as const;
export type ConsentFlagKind = (typeof CONSENT_FLAG_KINDS)[number];

export const REVISION_RISKS = ["low", "medium", "high"] as const;
export const MODEL_DECISIONS = ["accept", "human_review", "reject"] as const;
export type ModelDecision = (typeof MODEL_DECISIONS)[number];

export const DeliverableSchema = z.object({
  name: z.string(),
  format: z.string(), // "video" | "still image" | "voiceover" | ...
  aspectRatio: z.string().nullable(),
  duration: z.string().nullable(), // human text, e.g. "60s" / "15s" / null
  resolution: z.string().nullable(),
  exactTextRequirements: z.array(z.string()), // verbatim on-screen/spoken copy
});
export type AnalysisDeliverable = z.infer<typeof DeliverableSchema>;

export const ConsentFlagSchema = z.object({
  kind: z.enum(CONSENT_FLAG_KINDS),
  detail: z.string(),
});
export type ConsentFlag = z.infer<typeof ConsentFlagSchema>;

export const WorkflowStepSchema = z.object({
  capability: z.enum(CAPABILITIES),
  description: z.string(),
});
export type ProposedStep = z.infer<typeof WorkflowStepSchema>;

export const AnalysisSchema = z.object({
  jobType: z.string(),
  conciseSummary: z.string(),
  deliverables: z.array(DeliverableSchema),
  suppliedAssets: z.array(z.string()),
  missingAssets: z.array(z.string()),
  questionsForClient: z.array(z.string()),
  brandConstraints: z.array(z.string()),
  rightsAndConsentFlags: z.array(ConsentFlagSchema),
  technicalRisks: z.array(z.string()),
  revisionRisk: z.enum(REVISION_RISKS),
  confidence: z.number().int().min(0).max(100),
  decision: z.enum(MODEL_DECISIONS), // the model's *suggestion*; the app decides for real
  decisionReasons: z.array(z.string()),
  proposedWorkflow: z.array(WorkflowStepSchema),
  // Attempts the model estimates for each step, aligned by index with proposedWorkflow.
  estimatedAttemptsByStep: z.array(z.number().int().min(0)),
  assumptions: z.array(z.string()),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/**
 * Validate an unknown value (e.g. parsed model JSON) into an Analysis, with a
 * guarantee the deterministic layers rely on: estimatedAttemptsByStep is aligned
 * 1:1 with proposedWorkflow. A mismatch is treated as a malformed response.
 */
export function parseAnalysis(value: unknown): Analysis {
  const a = AnalysisSchema.parse(value);
  if (a.estimatedAttemptsByStep.length !== a.proposedWorkflow.length) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["estimatedAttemptsByStep"],
        message: `estimatedAttemptsByStep (${a.estimatedAttemptsByStep.length}) must align with proposedWorkflow (${a.proposedWorkflow.length}).`,
      },
    ]);
  }
  return a;
}

export function safeParseAnalysis(value: unknown): { ok: true; analysis: Analysis } | { ok: false; error: string } {
  try {
    return { ok: true, analysis: parseAnalysis(value) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
    }
    return { ok: false, error: (err as Error).message };
  }
}
