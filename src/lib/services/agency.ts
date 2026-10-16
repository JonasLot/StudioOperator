import "server-only";
import { config } from "@/lib/config";
import type {
  AgentMessage,
  AutonomySettings,
  ClientMemory,
  Escalation,
  Job,
  MessageChannel,
  MessageType,
  PauseCondition,
} from "@/lib/domain/types";
import {
  conceptsAutoAllowed,
  makeDefaultAutonomy,
  messageAutoAllowed,
  modelFamilyAllowed,
  triggeredPauses,
} from "@/lib/agency/autonomy";
import * as agent from "@/lib/agency/client-agent";
import { getTemplate } from "@/lib/agency/templates";
import { decideSelfRepair, type SelfRepairContext, type SelfRepairDecision } from "@/lib/agency/self-repair";
import { getModel } from "@/lib/higgsfield/catalog";
import { getRepo } from "@/lib/repo";
import { audit, listAudit } from "./audit";

export { listAudit };
import { computeProfitability, generationSpend } from "./economics";
import { newId } from "./ids";
import { jobQa } from "./qa";
import * as studio from "./studio";

const now = () => new Date().toISOString();

export function clientKey(name: string | null): string {
  return (name ?? "client").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ---------------------------------------------------------------------------
// Autonomy settings (single account-level row)
// ---------------------------------------------------------------------------

export function getAutonomy(): AutonomySettings {
  const repo = getRepo();
  const existing = repo.getAutonomy();
  if (existing) return existing;
  const fresh = makeDefaultAutonomy(config.autonomy, now());
  repo.upsertAutonomy(fresh);
  return fresh;
}

export function saveAutonomy(patch: Partial<Omit<AutonomySettings, "id" | "updatedAt">>): AutonomySettings {
  const current = getAutonomy();
  const next: AutonomySettings = { ...current, ...patch, id: "default", updatedAt: now() };
  getRepo().upsertAutonomy(next);
  audit({ kind: "decision", actor: "operator", summary: "Updated Autonomy Settings." });
  return next;
}

// ---------------------------------------------------------------------------
// Client memory (account level)
// ---------------------------------------------------------------------------

export function listClientMemory(): ClientMemory[] {
  return getRepo().listClientMemory();
}

export function getClientMemoryForJob(job: Job): ClientMemory | null {
  return getRepo().getClientMemory(clientKey(job.clientName));
}

export function upsertClientMemory(input: {
  displayName: string;
  logos?: string[];
  colors?: string[];
  fonts?: string[];
  tone?: string | null;
  productDetails?: string[];
  winningAssets?: string[];
  rejectedStyles?: string[];
  deliveryPreferences?: string | null;
  communicationPreferences?: string | null;
}): ClientMemory {
  const repo = getRepo();
  const key = clientKey(input.displayName);
  const existing = repo.getClientMemory(key);
  const m: ClientMemory = {
    id: existing?.id ?? newId("cm"),
    clientKey: key,
    displayName: input.displayName,
    logos: input.logos ?? existing?.logos ?? [],
    colors: input.colors ?? existing?.colors ?? [],
    fonts: input.fonts ?? existing?.fonts ?? [],
    tone: input.tone ?? existing?.tone ?? null,
    productDetails: input.productDetails ?? existing?.productDetails ?? [],
    winningAssets: input.winningAssets ?? existing?.winningAssets ?? [],
    rejectedStyles: input.rejectedStyles ?? existing?.rejectedStyles ?? [],
    deliveryPreferences: input.deliveryPreferences ?? existing?.deliveryPreferences ?? null,
    communicationPreferences: input.communicationPreferences ?? existing?.communicationPreferences ?? null,
    updatedAt: now(),
  };
  repo.upsertClientMemory(m);
  audit({ kind: "memory", summary: `${existing ? "Updated" : "Saved"} client memory for ${input.displayName}.` });
  return m;
}

// ---------------------------------------------------------------------------
// Messages — drafted or auto-sent per autonomy + channel rules
// ---------------------------------------------------------------------------

export function listMessages(jobId?: string): AgentMessage[] {
  return getRepo().listAgentMessages(jobId);
}

function channelForJob(job: Job): MessageChannel {
  return agent.channelFor(job.source);
}

/** Persist a drafted message; auto-send only when settings + channel allow it. */
export function draftMessage(jobId: string, type: MessageType, built: { subject: string; body: string }): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  if (!job) throw new Error("Job not found.");
  const settings = getAutonomy();
  const channel = channelForJob(job);
  const gate = messageAutoAllowed(settings, type, channel);
  const msg: AgentMessage = {
    id: newId("msg"),
    jobId,
    type,
    channel,
    subject: built.subject,
    body: built.body,
    status: gate.allowed ? "sent" : "drafted",
    autoAllowed: gate.allowed,
    heldReason: gate.reason,
    createdAt: now(),
    sentAt: gate.allowed ? now() : null,
  };
  repo.insertAgentMessage(msg);
  audit({ kind: "message_draft", summary: `Drafted ${type.replace(/_/g, " ")} for ${job.clientName ?? "client"} (${channel}).`, detail: gate.allowed ? "Auto-sent within autonomy settings." : gate.reason });
  if (gate.allowed) audit({ kind: "message_sent", summary: `Auto-sent ${type.replace(/_/g, " ")} (${channel}).` });
  return msg;
}

/** Human approves a drafted message and it is sent. */
export function approveAndSendMessage(messageId: string): AgentMessage {
  const repo = getRepo();
  const m = repo.getAgentMessage(messageId);
  if (!m) throw new Error("Message not found.");
  if (m.status === "sent") return m;
  repo.updateAgentMessage(m.id, { status: "sent", sentAt: now() });
  audit({ kind: "message_sent", actor: "operator", summary: `Approved and sent ${m.type.replace(/_/g, " ")} (${m.channel}).`, jobId: m.jobId });
  return repo.getAgentMessage(m.id)!;
}

// ---------------------------------------------------------------------------
// Client Agent orchestration (used by the demo seed and server actions)
// ---------------------------------------------------------------------------

export function runIntakeConversation(jobId: string): void {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const analysis = repo.getLatestAnalysis(jobId);
  if (!job || !analysis) return;
  const questions = agent.missingQuestions(analysis);
  const assets = agent.assetRequests(analysis);
  if (questions.length) {
    draftMessage(jobId, "intake_questions", {
      subject: `A few questions on "${job.title}"`,
      body: [`Hi ${job.clientName ?? "there"},`, ``, `Before I quote, a few things that materially affect the result:`, ...questions.map((q, i) => `  ${i + 1}. ${q.question} (${q.category})`), ``, `— Studio Operator`].join("\n"),
    });
  }
  if (assets.length) {
    draftMessage(jobId, "asset_request", {
      subject: `Assets I'll need for "${job.title}"`,
      body: [`Hi ${job.clientName ?? "there"},`, ``, `To produce this well, could you send:`, ...assets.map((a) => `  • ${a.asset} — ${a.why}`), ``, `— Studio Operator`].join("\n"),
    });
  }
}

/** Ask the client one specific question (used for a single material gap or by self-repair's ask_client). */
export function askClientQuestion(jobId: string, question: string): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  return draftMessage(jobId, "intake_questions", {
    subject: `Quick question on "${job.title}"`,
    body: [`Hi ${job.clientName ?? "there"},`, ``, question, ``, `— Studio Operator`].join("\n"),
  });
}

export function sendProgressUpdate(jobId: string, milestone: agent.Milestone): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  return draftMessage(jobId, "progress_update", agent.draftProgressUpdate(milestone, { title: job.title, clientName: job.clientName }));
}

export function presentConcept(jobId: string, opts: { changed: string; decisionNeeded: string }): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  const settings = getAutonomy();
  const built = agent.presentConcept({ title: job.title, clientName: job.clientName, changed: opts.changed, decisionNeeded: opts.decisionNeeded });
  const msg = draftMessage(jobId, "concept_presentation", { subject: built.subject, body: built.body });
  if (!conceptsAutoAllowed(settings)) audit({ kind: "decision", summary: "Concept held for approval (auto-share concepts is off)." });
  return msg;
}

export function sendProposal(jobId: string): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  const analysis = repo.getLatestAnalysis(jobId)!;
  const workflow = repo.getCurrentWorkflow(jobId);
  const template = getTemplate(job.templateId);
  const p = computeProfitability(job, workflow, repo.listGenerations(jobId), repo.listRevisions(jobId));
  const built = agent.draftProposal({
    title: job.title,
    clientName: job.clientName,
    analysis,
    template,
    priceUsd: job.budget,
    deadline: job.deadline,
    includedRevisions: template?.includedRevisions ?? 2,
    exclusions: [],
  });
  audit({ kind: "decision", summary: `Proposal prepared: $${job.budget} fixed, expected margin ${Math.round(p.expectedGrossMarginPct * 100)}%.` });
  return draftMessage(jobId, "proposal", built);
}

export function replyToRevision(jobId: string, note: string, includedRemaining: number, deliverableHint?: string | null): { message: AgentMessage; interpretation: agent.RevisionInterpretation } {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  const interpretation = agent.interpretRevision(note, { includedRemaining, deliverableHint });
  audit({ kind: "decision", summary: `Revision interpreted: ${interpretation.kind === "included" ? "included edit" : "scope change"} → ${interpretation.affectedStep} stage.`, detail: interpretation.rationale });
  const message = draftMessage(jobId, "revision_reply", agent.draftRevisionReply({ clientName: job.clientName, interpretation, note }));
  return { message, interpretation };
}

export function sendChangeOrder(jobId: string, opts: { note: string; addedPriceUsd: number; addedScope: string; newDeadline?: string }): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  audit({ kind: "cost_change", summary: `Change order drafted: +$${opts.addedPriceUsd} for added scope.`, costDeltaUsd: opts.addedPriceUsd });
  return draftMessage(jobId, "change_order", agent.draftChangeOrder({ title: job.title, clientName: job.clientName, ...opts }));
}

export function draftDelivery(jobId: string): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  const analysis = repo.getLatestAnalysis(jobId);
  const template = getTemplate(job.templateId);
  const selected = repo.listGenerations(jobId).filter((g) => g.selected && g.status === "completed");
  const pkg = agent.deliveryPackage({
    title: job.title,
    clientName: job.clientName,
    selectedTitles: selected.map((g) => getModel(g.model).label),
    template,
  });
  void analysis;
  return draftMessage(jobId, "delivery", { subject: `Delivery — ${job.title}`, body: [pkg.message, ``, `Files:`, ...pkg.fileList.map((f) => `  • ${f}`), ``, `Usage notes:`, ...pkg.usageNotes.map((u) => `  • ${u}`)].join("\n") });
}

export function sendFeedbackAsk(jobId: string): AgentMessage {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  return draftMessage(jobId, "feedback_request", agent.postDeliveryAsk({ title: job.title, clientName: job.clientName }));
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export function escalate(jobId: string | null, reason: Escalation["reason"], title: string, detail: string, recommendedAction: string): Escalation {
  const repo = getRepo();
  // De-dupe open escalations of the same reason on the same job.
  const open = repo.listEscalations(jobId ?? undefined).find((e) => e.reason === reason && e.status === "open" && e.jobId === jobId);
  if (open) return open;
  const e: Escalation = { id: newId("esc"), jobId, reason, title, detail, recommendedAction, status: "open", resolvedBy: null, resolvedAt: null, createdAt: now() };
  repo.insertEscalation(e);
  audit({ kind: "escalation", jobId, summary: `Escalated to human: ${title}`, detail: recommendedAction });
  return e;
}

export function listEscalations(jobId?: string): Escalation[] {
  return getRepo().listEscalations(jobId);
}

export function resolveEscalation(id: string): void {
  const repo = getRepo();
  const e = repo.getEscalation(id);
  if (!e || e.status === "resolved") return;
  repo.updateEscalation(id, { status: "resolved", resolvedBy: config.operatorName, resolvedAt: now() });
  audit({ kind: "escalation", actor: "operator", jobId: e.jobId, summary: `Resolved escalation: ${e.title}` });
}

/** Evaluate the always-pause conditions for a job and open escalations for any that are tripped. */
export function evaluatePauses(jobId: string): PauseCondition[] {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const analysis = repo.getLatestAnalysis(jobId);
  const workflow = repo.getCurrentWorkflow(jobId);
  if (!job || !analysis) return [];
  const settings = getAutonomy();
  const p = computeProfitability(job, workflow, repo.listGenerations(jobId), repo.listRevisions(jobId));
  const rightsText = analysis.rightsConcerns.join(" ").toLowerCase();
  const tripped = triggeredPauses(settings, {
    hasLikenessOrVoice: /likeness|voice|person|consent|actor/.test(rightsText),
    unclearOwnership: /ownership|rights unclear|usage|licen/.test(rightsText) && !job.rightsCleared,
    factualClaims: /claim|guarantee|clinically|best|number one|#1/.test(`${analysis.summary} ${job.rawBrief}`.toLowerCase()),
    regulatedCopy: /packaging|regulated|legal copy|medical|financial|pharma/.test(`${analysis.summary} ${job.rawBrief}`.toLowerCase()),
    expectedMarginPct: p.expectedGrossMarginPct,
    deadlineRisk: false,
    clientDispute: false,
  });
  const LABEL: Record<PauseCondition, string> = {
    likeness_or_voice: "Likeness or voice in the brief",
    unclear_ownership: "Unclear asset ownership",
    factual_claims: "Factual advertising claim to verify",
    packaging_or_regulated: "Exact packaging / regulated copy",
    negative_margin: "Expected margin is negative",
    deadline_risk: "Deadline at risk",
    client_dispute: "Client dispute",
  };
  for (const c of tripped) {
    escalate(jobId, c, LABEL[c], `Always-pause condition "${c}" is tripped for this job.`, "Review and clear before the agent proceeds.");
  }
  return tripped;
}

// ---------------------------------------------------------------------------
// Supervised self-repair loop
// ---------------------------------------------------------------------------

export interface SelfRepairPlanItem {
  generationId: string;
  stepName: string;
  modelLabel: string;
  verdict: string;
  decision: SelfRepairDecision;
}

function repairContextFor(jobId: string, modelId: string): Omit<SelfRepairContext, "introducesNewConcern"> {
  const repo = getRepo();
  const job = repo.getJob(jobId)!;
  const workflow = repo.getCurrentWorkflow(jobId);
  const gens = repo.listGenerations(jobId);
  const settings = getAutonomy();
  const model = getModel(modelId);
  const p = computeProfitability(job, workflow, gens, repo.listRevisions(jobId));
  const autoSpentThisJobUsd = gens.filter((g) => g.revisionId).reduce((a, g) => a + generationSpend(g), 0);
  return {
    unitCostUsd: model.unitCostUsd,
    attempts: config.qa.repairAttempts,
    maxAutoSpendPerRepairUsd: settings.maxAutoSpendPerRepairUsd,
    maxAutoSpendPerJobUsd: settings.maxAutoSpendPerJobUsd,
    autoSpentThisJobUsd,
    remainingJobBudgetUsd: (workflow?.maxBudget ?? job.budget) - p.committedSpend,
    modelFamilyAllowed: modelFamilyAllowed(settings, modelId),
  };
}

/** Read-only: per QA output that needs a fix, the supervised repair decision (for display). */
export function planSelfRepairs(jobId: string): SelfRepairPlanItem[] {
  const repo = getRepo();
  const qa = jobQa(jobId);
  const out: SelfRepairPlanItem[] = [];
  for (const o of qa.outputs) {
    if (o.report.verdict !== "controlled_edit" && o.report.verdict !== "regenerate") continue;
    const gen = repo.getGeneration(o.generationId);
    if (!gen) continue;
    const base = repairContextFor(jobId, gen.model);
    const decision = decideSelfRepair(o.report, { ...base, introducesNewConcern: null });
    out.push({ generationId: o.generationId, stepName: o.stepName, modelLabel: o.modelLabel, verdict: o.report.verdict, decision });
  }
  return out;
}

/**
 * Run the supervised self-repair loop: auto-fix within limits, escalate the rest.
 * Returns how many repairs auto-ran and how many were escalated.
 */
export async function applySelfRepairs(jobId: string): Promise<{ repaired: number; escalated: number }> {
  const repo = getRepo();
  const plan = planSelfRepairs(jobId);
  let repaired = 0;
  let escalated = 0;
  for (const item of plan) {
    const gen = repo.getGeneration(item.generationId);
    if (!gen) continue;
    const step = repo.getCurrentWorkflow(jobId)?.steps.find((s) => s.id === gen.stepId);
    if (item.decision.auto && item.decision.recommendedAction !== "ask_client" && item.decision.recommendedAction !== "escalate") {
      const action = item.decision.recommendedAction === "regenerate_shot" ? "regenerate_shot" : "regrade";
      const revId = newId("rv");
      repo.insertRevision({
        id: revId,
        jobId,
        clientNote: `QA self-repair — ${item.decision.smallestFailedComponent ?? "issue"} on ${item.stepName}.`,
        affectedDeliverable: null,
        recommendedAction: action,
        actionSummary: item.decision.recommendation,
        modelId: gen.model,
        attempts: config.qa.repairAttempts,
        expectedIncrementalCost: item.decision.incrementalCostUsd,
        materialChange: false,
        requiresApproval: false,
        approvalReason: null,
        approvalStatus: "approved",
        runStatus: "not_started",
        createdAt: now(),
      });
      audit({ kind: "repair", jobId, summary: `Auto-repair: ${item.decision.smallestFailedComponent} on ${item.stepName} via ${item.modelLabel}.`, detail: item.decision.recommendation, costDeltaUsd: item.decision.incrementalCostUsd });
      try {
        await studio.runRevision(jobId, revId);
        repaired++;
      } catch {
        // If it no longer fits the live budget, fall back to an escalation.
        escalate(jobId, "spend_limit", `Repair for ${item.stepName} needs approval`, item.decision.recommendation, "Approve a small budget increase or accept as a concept.");
        escalated++;
      }
    } else {
      const reason = item.decision.escalationReason ?? "Needs human approval";
      escalate(jobId, /identity|rights|factual/i.test(reason) ? "new_concern" : "spend_limit", `Repair for ${item.stepName} needs approval`, `${item.decision.smallestFailedComponent ?? "issue"}: ${reason}.`, item.decision.recommendation);
      if (step) void step;
      escalated++;
    }
  }
  return { repaired, escalated };
}
