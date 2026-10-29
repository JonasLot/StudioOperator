"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeParseAnalysis, type Analysis } from "@/lib/analysis/schema";
import { JOB_SOURCES, PAUSE_CONDITIONS, type MessageType, type PauseCondition, type TakeReview } from "@/lib/domain/types";
import { resetDemo } from "@/lib/seed";
import * as agency from "@/lib/services/agency";
import { GuardrailError } from "@/lib/services/guardrails";
import { authEnabled, clearLoginFailures, endSession, loginBlockedForMs, recordLoginFailure, requireSession, startSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth/session";
import * as clientPortal from "@/lib/services/client-portal";
import * as creative from "@/lib/services/creative";
import * as prompts from "@/lib/services/prompts";
import * as intake from "@/lib/services/intake";
import * as studio from "@/lib/services/studio";
import { mockSetting, saveDraftModel, saveProfile, setMockSetting } from "@/lib/settings";
import { parseMockSetting, validateDraftModel, validateProfile, type Profile } from "@/lib/settings/rules";
import { SECRET_DEFS, SECRET_NAMES, adminPasscode, saveSecrets, verifyAdminPasscode, type SecretName } from "@/lib/secrets";

import { loadRuntimeConfig } from "@/lib/runtime-config";
import { config } from "@/lib/config";
import { listEndpointModels } from "@/lib/creative/draft";

/** Every action: must be signed in, and sees current saved settings and keys. */
async function guard() {
  await requireSession();
  await loadRuntimeConfig();
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(jobId: string | null, fn: () => unknown | Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await guard();
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
  await guard();
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
export async function archiveJobAction(jobId: string) {
  return run(jobId, () => studio.archiveJob(jobId), "Job archived.");
}
export async function unarchiveJobAction(jobId: string) {
  return run(jobId, () => studio.unarchiveJob(jobId), "Job restored to the pipeline.");
}
export async function archiveClosedJobsAction(): Promise<ActionResult> {
  let n = 0;
  const r = await run(null, async () => {
    n = await studio.archiveClosedJobs();
  });
  revalidatePath("/jobs");
  return r.ok ? { ok: true, message: n ? `Archived ${n} closed job${n === 1 ? "" : "s"}.` : "Nothing to archive." } : r;
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
export async function updateStepAction(jobId: string, stepId: string, edit: studio.StepEdit, mode: studio.StepSaveMode = "save") {
  return run(jobId, () => studio.updateStep(jobId, stepId, edit, mode), mode === "save" ? "Step updated." : mode === "retry" ? "Step updated and retried." : "Step updated and re-running.");
}
export async function setStepReviewAction(jobId: string, stepId: string, requiresReview: boolean) {
  return run(jobId, () => studio.setStepReview(jobId, stepId, requiresReview));
}
export async function addStepAction(jobId: string, input: studio.NewStep) {
  return run(jobId, () => studio.addStep(jobId, input), "Step added.");
}
export async function removeStepAction(jobId: string, stepId: string) {
  return run(jobId, () => studio.removeStep(jobId, stepId), "Step removed.");
}
export async function approveStepOutputAction(jobId: string, stepId: string) {
  return run(jobId, () => studio.approveStepOutput(jobId, stepId), "Output approved.");
}
export async function retryStepAction(jobId: string, stepId: string) {
  return run(jobId, () => studio.retryStep(jobId, stepId), "Step retried.");
}
export async function toggleSelectAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.toggleSelect(generationId));
}
export async function reviewGenerationAction(jobId: string, generationId: string, status: TakeReview, note: string | null = null) {
  return run(jobId, () => studio.reviewGeneration(jobId, generationId, status, note));
}
export async function cancelGenerationAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.cancelGeneration(jobId, generationId), "Generation cancelled.");
}
export async function retryGenerationAction(jobId: string, generationId: string) {
  return run(jobId, () => studio.retryGeneration(jobId, generationId), "Retrying as a new attempt.");
}
// --- creative brief: first-phase draft, sparring with Astra, lock -------------

export async function draftBriefAction(jobId: string) {
  let warning: string | null = null;
  const r = await run(jobId, async () => {
    warning = (await creative.draftBrief(jobId)).warning;
  }, "Creative brief drafted.");
  return r.ok && warning ? ({ ok: true, message: warning } as const) : r;
}
export async function sparBriefAction(jobId: string, message: string) {
  return run(jobId, () => creative.sparBrief(jobId, message));
}
export async function saveBriefEditsAction(jobId: string, brief: unknown) {
  return run(jobId, () => creative.saveBriefEdits(jobId, brief), "Creative brief saved.");
}
export async function lockBriefAction(jobId: string) {
  return run(jobId, () => creative.lockBrief(jobId), "Creative brief locked.");
}
export async function unlockBriefAction(jobId: string) {
  return run(jobId, () => creative.unlockBrief(jobId), "Creative brief unlocked.");
}

export async function suggestStepPromptAction(jobId: string, stepId: string): Promise<{ ok: true; prompt: string; warning: string | null } | { ok: false; error: string }> {
  try {
    await guard();
    const r = await creative.suggestPromptForStep(jobId, stepId);
    return { ok: true, prompt: r.prompt, warning: r.warning };
  } catch (err) {
    if (err instanceof GuardrailError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: (err as Error).message || "Something went wrong." };
  }
}

// --- prompt library ------------------------------------------------------------

export type PromptFields = { name: string; category: string; modelId: string | null; tags: string; body: string; notes: string };

export async function savePromptAction(input: PromptFields, sourceJobId: string | null = null) {
  const r = await run(sourceJobId, () => prompts.savePrompt(input, sourceJobId), "Saved to the prompt library.");
  revalidatePath("/prompts");
  return r;
}
export async function savePromptFromTakeAction(jobId: string, generationId: string, name: string) {
  const r = await run(jobId, () => prompts.savePromptFromTake(jobId, generationId, name, null), "Saved to the prompt library.");
  revalidatePath("/prompts");
  return r;
}
export async function updatePromptAction(id: string, input: PromptFields) {
  const r = await run(null, () => prompts.updatePrompt(id, input), "Prompt updated.");
  revalidatePath("/prompts");
  return r;
}
export async function deletePromptAction(id: string) {
  const r = await run(null, () => prompts.deletePrompt(id), "Prompt deleted.");
  revalidatePath("/prompts");
  return r;
}
export async function markPromptUsedAction(id: string) {
  const r = await run(null, () => prompts.markPromptUsed(id));
  revalidatePath("/prompts");
  return r;
}

export async function connectionTestAction(): Promise<ActionResult & { detail?: string; providerName?: string; live?: boolean }> {
  await guard();
  const r = await studio.providerConnectionTest();
  return r.ok ? { ok: true, message: r.detail, detail: r.detail, providerName: r.name, live: r.live } : { ok: false, error: r.detail, detail: r.detail, providerName: r.name, live: r.live };
}
export async function addRevisionAction(jobId: string, note: string, deliverable: string | null) {
  return run(jobId, () => studio.addRevision(jobId, note, deliverable), "Revision note logged.");
}
export async function runRevisionAction(jobId: string, revisionId: string) {
  return run(jobId, () => studio.runRevision(jobId, revisionId), "Revision running.");
}
export async function createClientLinkAction(jobId: string) {
  return run(jobId, () => clientPortal.ensureClientShare(jobId), "Client link created.");
}
export async function revokeClientLinkAction(jobId: string) {
  return run(jobId, () => clientPortal.revokeClientShare(jobId), "Client link revoked.");
}
export async function approveDeliveryAction(jobId: string, attestation: string) {
  return run(jobId, () => studio.approveFinalDelivery(jobId, attestation), "Final delivery approved.");
}
export async function reviewIntakeAction(jobId: string, edited: Analysis, action: "save" | "approve" | "reject"): Promise<ActionResult> {
  await guard();
  const parsed = safeParseAnalysis(edited);
  if (!parsed.ok) return { ok: false, error: `Analysis is invalid: ${parsed.error}` };
  return run(
    jobId,
    async () => {
      const result = await intake.reviewIntake(jobId, { edited: parsed.analysis, action });
      // Edits change what was costed, so rebuild the plan from them (no-op once a workflow is approved).
      if (result.changed && action !== "reject") await studio.replanAfterReview(jobId);
      return result;
    },
    action === "approve" ? "Analysis approved." : action === "reject" ? "Job rejected." : "Edits saved.",
  );
}

export async function resetDemoAction() {
  await guard();
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function resetDemoToPresentAction() {
  await guard();
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
  await guard();
  const num = (k: string, d: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  try {
    const alwaysPause = Object.fromEntries(
      PAUSE_CONDITIONS.map((c) => [c, form.get(`pause_${c}`) === "on"]),
    ) as Record<PauseCondition, boolean>;
    await agency.saveAutonomy({
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
  await guard();
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
    const r = await saveSecrets(updates, remove);
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

export type DraftModelState = { ok?: true; message?: string; error?: string } | undefined;

/** Save (or clear) the endpoint and model of the first-phase AI. Needs the admin passcode, like API keys. */
export async function saveDraftModelAction(_prev: DraftModelState, form: FormData): Promise<DraftModelState> {
  await guard();
  if (!adminPasscode()) {
    return { error: "Saving here is switched off: set ADMIN_PASSCODE (12+ characters) in the server environment, or set DRAFT_AI_BASE_URL and DRAFT_AI_MODEL instead." };
  }
  if (!verifyAdminPasscode(String(form.get("passcode") ?? ""))) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return { error: "Wrong admin passcode." };
  }
  try {
    if (form.get("clear") === "on") {
      await saveDraftModel(null);
      revalidatePath("/", "layout");
      return { ok: true, message: "Cleared. The environment variables (if any) apply again." };
    }
    const r = validateDraftModel({ baseUrl: form.get("baseUrl"), model: form.get("model") });
    if (!r.ok) return { error: Object.values(r.errors)[0] };
    await saveDraftModel(r.value);
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved. Drafts now use ${r.value.model} at ${r.value.baseUrl}.` };
  } catch (err) {
    console.error("Saving the first-phase AI failed:", (err as Error).name);
    return { error: "Could not save. Check that the database is reachable." };
  }
}

/** The models the given first-phase endpoint offers, so the operator picks one that is actually installed. Reads only. */
export async function listDraftModelsAction(baseUrl: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  await guard();
  const r = validateDraftModel({ baseUrl, model: "probe" });
  if (!r.ok) return { ok: false, error: r.errors.baseUrl ?? "Check the endpoint address." };
  try {
    const models = await listEndpointModels(r.value.baseUrl, config.draft.apiKey);
    return models.length ? { ok: true, models } : { ok: false, error: "The endpoint answered but lists no models. Pull one first (e.g. ollama pull gemma4)." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// --- sign in / out ------------------------------------------------------------

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!authEnabled()) redirect("/");
  const wait = await loginBlockedForMs();
  if (wait > 0) return { error: `Too many wrong attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).` };
  if (!verifyAdminPasscode(String(form.get("passcode") ?? ""))) {
    await recordLoginFailure();
    await new Promise((resolve) => setTimeout(resolve, 800)); // slow down guessing
    return { error: "Wrong passcode." };
  }
  await clearLoginFailures();
  await startSession();
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function logoutAction() {
  await endSession();
  redirect(authEnabled() ? "/login" : "/");
}

// --- profile --------------------------------------------------------------------

export type ProfileState = { ok?: true; message?: string; error?: string; fieldErrors?: Partial<Record<keyof Profile, string>>; values?: Profile } | undefined;

export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  await guard();
  const parsed = validateProfile({ displayName: form.get("displayName"), studioName: form.get("studioName"), email: form.get("email") });
  if (!parsed.ok) {
    // Hand the typed values back so the form keeps them next to the errors.
    const text = (k: string) => String(form.get(k) ?? "");
    return { error: "Check the highlighted fields.", fieldErrors: parsed.errors, values: { displayName: text("displayName"), studioName: text("studioName"), email: text("email") } };
  }
  try {
    await saveProfile(parsed.value);
  } catch (err) {
    console.error("Saving profile failed:", (err as Error).name);
    return { error: "Could not save the profile. Check that the database is reachable." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

// --- mock mode ------------------------------------------------------------------

export type MockModeState = { ok?: true; message?: string; error?: string } | undefined;

/**
 * Switch between mock and live. Mock is always allowed (it can only reduce spend); going live,
 * or back to following the environment, needs the admin passcode because it can start real spend.
 */
export async function setMockModeAction(_prev: MockModeState, form: FormData): Promise<MockModeState> {
  await guard();
  const choice = String(form.get("mode") ?? "");
  if (choice !== "mock" && choice !== "live" && choice !== "default") return { error: "Pick a mode." };
  if (choice !== "mock") {
    if (!adminPasscode()) return { error: "Going live from here needs ADMIN_PASSCODE set on the server." };
    if (!verifyAdminPasscode(String(form.get("passcode") ?? ""))) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { error: "Wrong admin passcode." };
    }
  }
  try {
    await setMockSetting(choice === "default" ? null : parseMockSetting(choice));
  } catch (err) {
    console.error("Saving mock mode failed:", (err as Error).name);
    return { error: "Could not save the setting. Check that the database is reachable." };
  }
  revalidatePath("/", "layout");
  const now = mockSetting();
  return {
    ok: true,
    message: now === "mock" ? "Mock mode is on — no external calls are made." : now === "live" ? "Live mode is on — providers with keys will be called." : "Following the server environment again.",
  };
}
