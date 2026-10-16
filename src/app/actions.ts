"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeParseAnalysis, type Analysis } from "@/lib/analysis/schema";
import { JOB_SOURCES, PAUSE_CONDITIONS, type MessageType, type PauseCondition } from "@/lib/domain/types";
import { resetDemo } from "@/lib/seed";
import * as agency from "@/lib/services/agency";
import { GuardrailError } from "@/lib/services/guardrails";
import * as intake from "@/lib/services/intake";
import * as studio from "@/lib/services/studio";
import { SECRET_DEFS, SECRET_NAMES, adminPasscode, saveSecrets, verifyAdminPasscode, type SecretName } from "@/lib/secrets";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(jobId: string | null, fn: () => unknown | Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/");
    if (jobId) revalidatePath(`/jobs/${jobId}`);
    return { ok: true, message };
  } catch (err) {
    if (err instanceof GuardrailError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: (err as Error).message || "Something went wrong." };
  }
}

const NewJobSchema = z.object({
  title: z.string().trim().min(1, "Give the job a working title."),
  source: z.enum(JOB_SOURCES),
  clientName: z.string().trim().optional(),
  rawBrief: z.string().trim().min(40, "Paste the full brief (at least a few sentences)."),
  budget: z.coerce.number().positive("Client price must be above zero."),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a deadline."),
  clientNotes: z.string().trim().optional(),
  referenceAssets: z.string().optional(),
  sourceFeePct: z.coerce.number().min(0).max(100),
});

export type NewJobState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;

export async function createJobAction(_prev: NewJobState, form: FormData): Promise<NewJobState> {
  const parsed = NewJobSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  let id: string;
  try {
    id = await studio.createJob({
      title: d.title,
      source: d.source,
      clientName: d.clientName || null,
      rawBrief: d.rawBrief,
      budget: d.budget,
      deadline: d.deadline,
      clientNotes: d.clientNotes || null,
      referenceAssets: (d.referenceAssets ?? "")
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
      sourceFeePct: d.sourceFeePct / 100,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/");
  redirect(`/jobs/${id}`);
}

export async function analyzeAction(jobId: string) {
  return run(jobId, () => studio.analyzeAndPlan(jobId), "Brief analysed and plan rebuilt.");
}
export async function clearRightsAction(jobId: string, approvalId: string, note: string) {
  return run(jobId, () => studio.clearRights(jobId, approvalId, note), "Rights cleared.");
}
export async function approveWorkflowAction(jobId: string, maxBudget: number) {
  return run(jobId, () => studio.approveInitialWorkflow(jobId, maxBudget), "Workflow and budget approved.");
}
export async function rejectJobAction(jobId: string, reason: string) {
  return run(jobId, () => studio.rejectJob(jobId, reason), "Job rejected.");
}
export async function reopenJobAction(jobId: string) {
  return run(jobId, () => studio.reopenJob(jobId), "Job reopened for review.");
}
export async function updateEconomicsAction(jobId: string, patch: { sourceFeePct?: number; contingencyPct?: number }) {
  return run(jobId, () => studio.updateEconomics(jobId, patch));
}
export async function startProductionAction(jobId: string) {
  return run(jobId, () => studio.startProduction(jobId), "Production started.");
}
export async function tickAction(jobId: string) {
  return run(jobId, () => studio.tick(jobId));
}
export async function tickAllAction() {
  return run(null, () => studio.tickAllGenerating());
}
export async function approveBudgetIncreaseAction(jobId: string, approvalId: string, newCap: number) {
  return run(jobId, () => studio.approveBudgetIncrease(jobId, approvalId, newCap), "Cap raised.");
}
export async function decideApprovalAction(jobId: string, approvalId: string, status: "approved" | "rejected") {
  return run(jobId, () => studio.decideGenericApproval(jobId, approvalId, status));
}
export async function retryStepAction(jobId: string, stepId: string) {
  return run(jobId, () => studio.retryStep(jobId, stepId), "Step retried.");
}
export async function toggleSelectAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.toggleSelect(generationId));
}
export async function cancelGenerationAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.cancelGeneration(jobId, generationId), "Generation cancelled.");
}
export async function retryGenerationAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.retryGeneration(jobId, generationId), "Retrying as a new attempt.");
}
export async function connectionTestAction(): Promise<ActionResult & { detail?: string; providerName?: string; live?: boolean }> {
  const r = await studio.providerConnectionTest();
  return r.ok ? { ok: true, message: r.detail, detail: r.detail, providerName: r.name, live: r.live } : { ok: false, error: r.detail, detail: r.detail, providerName: r.name, live: r.live };
}
export async function addRevisionAction(jobId: string, note: string, deliverable: string | null) {
  return run(jobId, () => studio.addRevision(jobId, note, deliverable), "Revision note logged.");
}
export async function runRevisionAction(jobId: string, revisionId: string) {
  return run(jobId, () => studio.runRevision(jobId, revisionId), "Revision running.");
}
export async function approveDeliveryAction(jobId: string, attestation: string) {
  return run(jobId, () => studio.approveFinalDelivery(jobId, attestation), "Final delivery approved.");
}
export async function reviewIntakeAction(jobId: string, edited: Analysis, action: "save" | "approve" | "reject"): Promise<ActionResult> {
  const parsed = safeParseAnalysis(edited);
  if (!parsed.ok) return { ok: false, error: `Analysis is invalid: ${parsed.error}` };
  return run(
    jobId,
    () => {
      const result = intake.reviewIntake(jobId, { edited: parsed.analysis, action });
      // Edits change what was costed, so rebuild the plan from them (no-op once a workflow is approved).
      if (result.changed && action !== "reject") studio.replanAfterReview(jobId);
      return result;
    },
    action === "approve" ? "Analysis approved." : action === "reject" ? "Job rejected." : "Edits saved.",
  );
}

export async function resetDemoAction() {
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function resetDemoToPresentAction() {
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/present");
}

// --- supervised autonomy ---------------------------------------------------

export async function approveAndSendMessageAction(jobId: string, messageId: string) {
  return run(jobId, () => agency.approveAndSendMessage(messageId), "Message approved and sent.");
}

export async function resolveEscalationAction(jobId: string | null, escalationId: string) {
  return run(jobId, () => agency.resolveEscalation(escalationId), "Escalation resolved.");
}

const AUTONOMY_MESSAGE_TYPES = [
  "intake_questions", "asset_request", "proposal", "progress_update", "concept_presentation", "revision_reply", "change_order", "delivery", "feedback_request",
] as const satisfies readonly MessageType[];

export type AutonomyState = { error?: string; ok?: boolean } | undefined;

export async function saveAutonomyAction(_prev: AutonomyState, form: FormData): Promise<AutonomyState> {
  const num = (k: string, d: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  try {
    const alwaysPause = Object.fromEntries(
      PAUSE_CONDITIONS.map((c) => [c, form.get(`pause_${c}`) === "on"]),
    ) as Record<PauseCondition, boolean>;
    agency.saveAutonomy({
      maxAutoSpendPerJobUsd: num("maxAutoSpendPerJobUsd", 60),
      maxAutoSpendPerRepairUsd: num("maxAutoSpendPerRepairUsd", 8),
      maxAttemptsPerStep: num("maxAttemptsPerStep", 16),
      allowedModelFamilies: (form.get("allowedModelFamilies")?.toString() ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      autoSendMessageTypes: AUTONOMY_MESSAGE_TYPES.filter((t) => form.get(`msg_${t}`) === "on"),
      autoShareConcepts: form.get("autoShareConcepts") === "on",
      finalDeliveryAlwaysApproval: form.get("finalDeliveryAlwaysApproval") === "on",
      alwaysPause,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/autonomy");
  revalidatePath("/present");
  return { ok: true };
}

export type ApiKeysState = { ok?: true; message?: string; error?: string } | undefined;

/**
 * Save or remove API keys from the Settings page. Every request must carry the admin
 * passcode (no session to hijack, nothing to forge cross-site). Values are never echoed
 * back or logged; the result only names which keys changed.
 */
export async function saveApiKeysAction(_prev: ApiKeysState, form: FormData): Promise<ApiKeysState> {
  if (!adminPasscode()) {
    return { error: "Saving keys here is switched off: set ADMIN_PASSCODE (12+ characters) in the server environment and redeploy." };
  }
  if (!verifyAdminPasscode(String(form.get("passcode") ?? ""))) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return { error: "Wrong admin passcode." };
  }
  const updates: Partial<Record<SecretName, string>> = {};
  const remove: SecretName[] = [];
  for (const name of SECRET_NAMES) {
    const value = String(form.get(name) ?? "");
    if (value.trim()) updates[name] = value;
    if (form.get(`remove_${name}`) === "on" && !value.trim()) remove.push(name);
  }
  if (!Object.keys(updates).length && !remove.length) return { error: "Nothing to save — paste a key, or tick one to remove." };
  try {
    const r = saveSecrets(updates, remove);
    if (!r.ok) return { error: r.error };
    revalidatePath("/", "layout");
    const parts = [
      r.saved.length ? `Saved ${r.saved.map((n) => SECRET_DEFS[n].label).join(", ")}.` : "",
      r.removed.length ? `Removed ${r.removed.map((n) => SECRET_DEFS[n].label).join(", ")} (falls back to the environment variable).` : "",
    ].filter(Boolean);
    return { ok: true, message: parts.join(" ") };
  } catch (err) {
    console.error("Saving API keys failed:", (err as Error).name);
    return { error: "Could not save the keys. Check that the database is reachable." };
  }
}
