import "server-only";
import { coerceBrief, changedFields, creativeDirectionText, FIELD_LABEL, type BriefMessage, type CreativeBrief } from "@/lib/creative/brief";
import { mockDraft } from "@/lib/creative/mock";
import { draftCreativeBrief } from "@/lib/creative/draft";
import { sparOnBrief } from "@/lib/creative/spar";
import { suggestStepPrompt, type StepPromptResult } from "@/lib/creative/step-prompt";
import { getModel } from "@/lib/higgsfield/catalog";
import type { CreativeBriefRecord, Job } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { GuardrailError } from "./guardrails";
import { newId } from "./ids";

const now = () => new Date().toISOString();

async function log(jobId: string, actor: "operator" | "agent" | "system", message: string) {
  await getRepo().insertActivity({ id: newId("ev"), jobId, actor, message, createdAt: now() });
}

async function openJob(jobId: string): Promise<Job> {
  const job = await getRepo().getJob(jobId);
  if (!job) throw new GuardrailError("Job not found.");
  if (job.status === "rejected" || job.status === "delivered") throw new GuardrailError("This job is closed; the creative brief can no longer change.");
  return job;
}

async function editable(jobId: string): Promise<{ job: Job; rec: CreativeBriefRecord }> {
  const job = await openJob(jobId);
  const rec = await getCreativeBrief(jobId);
  if (!rec) throw new GuardrailError("Draft a creative brief first.");
  if (rec.status === "locked") throw new GuardrailError("The creative brief is locked. Unlock it to change it.");
  return { job, rec };
}

export const getCreativeBrief = (jobId: string) => getRepo().getCreativeBrief(jobId);

/**
 * The creative direction to append to step prompts: prefers a locked brief, falls back to a draft brief,
 * or drafts one deterministically from the job's brief so generation prompts always have concrete direction.
 */
export async function creativeDirectionFor(jobId: string): Promise<string> {
  const rec = await getCreativeBrief(jobId);
  if (rec?.brief) return creativeDirectionText(rec.brief);
  const job = await getRepo().getJob(jobId);
  if (job) {
    const brief = mockDraft({ title: job.title, rawBrief: job.rawBrief, clientNotes: job.clientNotes });
    return creativeDirectionText(brief);
  }
  return "";
}

/** First phase: the cheap / local model writes the draft. Replaces an existing unlocked draft. */
export async function draftBrief(jobId: string): Promise<{ warning: string | null }> {
  const job = await openJob(jobId);
  const existing = await getCreativeBrief(jobId);
  if (existing?.status === "locked") throw new GuardrailError("The creative brief is locked. Unlock it before drafting again.");
  const r = await draftCreativeBrief({ title: job.title, rawBrief: job.rawBrief, clientNotes: job.clientNotes });
  const t = now();
  await getRepo().upsertCreativeBrief({
    id: existing?.id ?? newId("cb"),
    jobId,
    status: "draft",
    brief: r.brief,
    thread: r.warning ? [{ role: "system" as const, content: r.warning, at: t }] : [],
    drafter: r.drafter,
    lockedAt: null,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  });
  await log(jobId, "agent", `Drafted a creative brief with ${r.drafter}.`);
  return { warning: r.warning };
}

/** Second phase: the operator talks it through with Astra. An empty message asks Astra to review the draft. */
export async function sparBrief(jobId: string, message: string) {
  const { job, rec } = await editable(jobId);
  const text = message.trim().slice(0, 1500);
  const out = await sparOnBrief({ title: job.title, rawBrief: job.rawBrief, clientNotes: job.clientNotes }, rec.brief, rec.thread, text);
  const t = now();
  const changed = changedFields(rec.brief, out.brief).map((k) => FIELD_LABEL[k]);
  const thread: BriefMessage[] = [
    ...rec.thread,
    ...(text ? [{ role: "operator" as const, content: text, at: t }] : []),
    { role: "astra" as const, content: out.warning ? `${out.reply}\n\n${out.warning}` : out.reply, at: t },
  ].slice(-40);
  await getRepo().upsertCreativeBrief({ ...rec, brief: out.brief, thread, updatedAt: t });
  await log(jobId, "agent", `${out.astra} revised the creative brief${changed.length ? ` (${changed.join(", ")})` : " (no changes)"}.`);
}

/** The operator edits the fields by hand. */
export async function saveBriefEdits(jobId: string, edited: unknown) {
  const { rec } = await editable(jobId);
  const brief = coerceBrief(edited);
  if (!brief) throw new GuardrailError("The brief needs a logline: one sentence on what this piece is.");
  await getRepo().upsertCreativeBrief({ ...rec, brief, updatedAt: now() });
  await log(jobId, "operator", "Edited the creative brief.");
}

/** Locking makes the brief part of every step prompt submitted from now on. */
export async function lockBrief(jobId: string) {
  const { rec } = await editable(jobId);
  const t = now();
  await getRepo().upsertCreativeBrief({ ...rec, status: "locked", lockedAt: t, updatedAt: t });
  await log(jobId, "operator", "Locked the creative brief. It now guides every step prompt.");
}

export async function unlockBrief(jobId: string) {
  const job = await openJob(jobId);
  const rec = await getCreativeBrief(job.id);
  if (!rec || rec.status !== "locked") throw new GuardrailError("The creative brief is not locked.");
  await getRepo().upsertCreativeBrief({ ...rec, status: "draft", lockedAt: null, updatedAt: now() });
  await log(jobId, "operator", "Unlocked the creative brief for changes.");
}

/** The first-phase model proposes a prompt for one step from the brief and preceding steps. Nothing is saved. */
export async function suggestPromptForStep(jobId: string, stepId: string): Promise<StepPromptResult> {
  const job = await openJob(jobId);
  let rec = await getCreativeBrief(jobId);
  if (!rec) {
    try {
      await draftBrief(jobId);
      rec = await getCreativeBrief(jobId);
    } catch {
      // non-fatal fallback
    }
  }
  const brief = rec?.brief ?? mockDraft({ title: job.title, rawBrief: job.rawBrief, clientNotes: job.clientNotes });
  const wf = await getRepo().getCurrentWorkflow(jobId);
  const step = wf?.steps.find((s) => s.id === stepId);
  if (!step) throw new GuardrailError("Step not found.");
  const prevStep = wf?.steps.filter((s) => s.order < step.order).sort((a, b) => b.order - a.order)[0] ?? null;
  return suggestStepPrompt(
    {
      stepName: step.name,
      category: step.category,
      modelLabel: getModel(step.modelId).label,
      purpose: step.purpose,
      inputs: step.inputs,
      expectedOutputs: step.expectedOutputs,
      prevStep: prevStep ? { name: prevStep.name, purpose: prevStep.purpose } : null,
    },
    brief,
  );
}

export type { CreativeBrief };
