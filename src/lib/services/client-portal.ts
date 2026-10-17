import "server-only";
import { randomBytes } from "node:crypto";
import type { ClientFeedback, ClientFeedbackKind, ClientShare, Generation, JobStatus, Workflow } from "@/lib/domain/types";
import {
  MAX_FEEDBACK_PER_JOB,
  cleanText,
  deliverableHint,
  isClientVisible,
  portalBrief,
  portalDeliveries,
  portalQuestions,
  portalStages,
  tooManyRecent,
  waitingOnClient,
  type PortalBrief,
  type PortalDelivery,
  type PortalQuestion,
  type PortalStage,
} from "@/lib/agency/portal";
import { getRepo } from "@/lib/repo";
import { getProfile } from "@/lib/settings";
import { GuardrailError } from "./guardrails";
import { newId } from "./ids";
import { getBrief } from "./intake";
import { addRevision } from "./studio";

const now = () => new Date().toISOString();
const TOUCH_EVERY_MS = 60_000;

// ---------------------------------------------------------------------------
// Operator side: create / revoke the link
// ---------------------------------------------------------------------------

const isActive = (s: ClientShare | null): s is ClientShare => !!s && !s.revokedAt;

/** The job's live link, minted on first use. A revoked link is replaced by a fresh token, never revived. */
export async function ensureClientShare(jobId: string): Promise<ClientShare> {
  const repo = getRepo();
  if (!(await repo.getJob(jobId))) throw new GuardrailError("Job not found.");
  const existing = await repo.getClientShareByJob(jobId);
  if (isActive(existing)) return existing;
  const share: ClientShare = { id: newId("sh"), jobId, token: randomBytes(24).toString("base64url"), createdAt: now(), revokedAt: null, lastViewedAt: null };
  await repo.insertClientShare(share);
  await repo.insertActivity({ id: newId("ev"), jobId, actor: "operator", message: "Created the client link.", createdAt: now() });
  return share;
}

export async function revokeClientShare(jobId: string): Promise<void> {
  const repo = getRepo();
  const share = await repo.getClientShareByJob(jobId);
  if (!isActive(share)) return;
  await repo.updateClientShare(share.id, { revokedAt: now() });
  await repo.insertActivity({ id: newId("ev"), jobId, actor: "operator", message: "Revoked the client link.", createdAt: now() });
}

export async function operatorClientView(jobId: string): Promise<{ share: ClientShare | null; feedback: ClientFeedback[] }> {
  const repo = getRepo();
  const [share, feedback] = await Promise.all([repo.getClientShareByJob(jobId), repo.listClientFeedback(jobId)]);
  return { share: isActive(share) ? share : null, feedback };
}

// ---------------------------------------------------------------------------
// Client side: everything is reached through the token
// ---------------------------------------------------------------------------

export interface PortalData {
  studioName: string;
  title: string;
  clientName: string | null;
  deadline: string;
  status: JobStatus;
  stages: PortalStage[] | null;
  brief: PortalBrief | null;
  questions: PortalQuestion[];
  deliveries: PortalDelivery[];
  waiting: { questions: number; reviews: number };
  messages: { id: string; kind: ClientFeedbackKind; body: string; createdAt: string }[]; // the client's own words, echoed back
}

async function resolve(token: string) {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return null;
  const repo = getRepo();
  const share = await repo.getClientShareByToken(token);
  if (!isActive(share)) return null;
  const job = await repo.getJob(share.jobId);
  return job ? { share, job } : null;
}

export async function loadPortal(token: string): Promise<PortalData | null> {
  const hit = await resolve(token);
  if (!hit) return null;
  const { share, job } = hit;
  const repo = getRepo();
  const [brief, workflow, generations, feedback] = await Promise.all([getBrief(job.id), repo.getCurrentWorkflow(job.id), repo.listGenerations(job.id), repo.listClientFeedback(job.id)]);

  if (!share.lastViewedAt || Date.now() - Date.parse(share.lastViewedAt) > TOUCH_EVERY_MS) {
    await repo.updateClientShare(share.id, { lastViewedAt: now() }).catch(() => {});
  }

  const questions = portalQuestions(brief, feedback);
  const deliveries = portalDeliveries(generations, workflow, brief, feedback);
  return {
    studioName: getProfile().studioName,
    title: job.title,
    clientName: job.clientName,
    deadline: job.deadline,
    status: job.status,
    stages: portalStages(job.status),
    brief: brief ? portalBrief(brief) : null,
    questions,
    deliveries,
    waiting: waitingOnClient(questions, deliveries, job.status),
    messages: feedback.map((f) => ({ id: f.id, kind: f.kind, body: f.body, createdAt: f.createdAt })),
  };
}

/** A take the token's job is allowed to show, for the media route. */
export async function portalTake(token: string, generationId: string): Promise<Generation | null> {
  const hit = await resolve(token);
  if (!hit) return null;
  const g = await getRepo().getGeneration(generationId);
  return g && g.jobId === hit.job.id && isClientVisible(g) ? g : null;
}

export type FeedbackInput =
  | { kind: "answer"; ref: string; body: string }
  | { kind: "brief_ok" }
  | { kind: "brief_change"; body: string }
  | { kind: "approve"; ref: string }
  | { kind: "change"; ref: string; body: string }
  | { kind: "comment"; body: string };

const ACTIVITY: Record<ClientFeedbackKind, (body: string) => string> = {
  answer: (b) => `Client answered a question: “${b.slice(0, 80)}”`,
  brief_ok: () => "Client confirmed the brief is right.",
  brief_change: (b) => `Client says the brief needs changes: “${b.slice(0, 80)}”`,
  approve: () => "Client approved a delivery.",
  change: (b) => `Client asked for a change: “${b.slice(0, 80)}”`,
  comment: (b) => `Client commented: “${b.slice(0, 80)}”`,
};

export async function submitClientFeedback(token: string, input: FeedbackInput): Promise<void> {
  const hit = await resolve(token);
  if (!hit) throw new GuardrailError("This link is no longer active.");
  const { job } = hit;
  const repo = getRepo();
  if (job.status === "rejected" || job.status === "delivered") throw new GuardrailError("This project is closed. Get in touch directly to reopen it.");

  const existing = await repo.listClientFeedback(job.id);
  if (existing.length >= MAX_FEEDBACK_PER_JOB) throw new GuardrailError("Too many messages on this project. Please email instead.");
  if (tooManyRecent(existing, Date.now())) throw new GuardrailError("Slow down a little — try again in a minute.");

  const kind = input.kind;
  const body = "body" in input ? cleanText(input.body) : null;
  if ((kind === "answer" || kind === "brief_change" || kind === "change" || kind === "comment") && !body) throw new GuardrailError("Write a few words first.");

  let ref: string | null = null;
  let revisionId: string | null = null;

  if (kind === "answer") {
    const questions = portalQuestions(await getBrief(job.id), existing);
    ref = questions.find((q) => q.question === input.ref)?.question ?? null;
    if (!ref) throw new GuardrailError("That question is no longer open.");
  }

  if (kind === "approve" || kind === "change") {
    const take = await repo.getGeneration(input.ref);
    if (!take || take.jobId !== job.id || !isClientVisible(take)) throw new GuardrailError("That delivery isn't available.");
    ref = take.id;
    if (kind === "change" && job.status === "qa") {
      // Same path as a note the operator logs by hand, so scope and budget guardrails apply unchanged.
      const workflow: Workflow | null = await repo.getCurrentWorkflow(job.id);
      try {
        revisionId = await addRevision(job.id, body!, deliverableHint(take, workflow));
      } catch (err) {
        if (!(err instanceof GuardrailError)) throw err; // the feedback is still kept, just not turned into a revision
      }
    }
  }

  const row: ClientFeedback = { id: newId("cf"), jobId: job.id, kind, ref, body: body ?? "", revisionId, createdAt: now() };
  await repo.insertClientFeedback(row);
  await repo.insertActivity({ id: newId("ev"), jobId: job.id, actor: "system", message: ACTIVITY[kind](row.body), createdAt: now() });
}

