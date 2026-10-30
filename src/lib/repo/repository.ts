import type {
  ActivityEvent,
  AgentMessage,
  ApprovalRequest,
  AuditEntry,
  AutonomySettings,
  ClientFeedback,
  ClientMemory,
  ClientShare,
  CreativeBriefRecord,
  Escalation,
  Generation,
  IntakeAnalysis,
  Job,
  Revision,
  SavedPrompt,
  StoredAsset,
  Workflow,
  WorkflowStep,
} from "@/lib/domain/types";
import type { Invoice } from "@/lib/domain/invoice";

/**
 * Persistence boundary. Everything above this interface (services, UI) is storage-agnostic.
 * Every method is async so the same code runs on SQLite
 * (see sql-repository.ts and drivers/).
 */
export interface StudioRepository {
  /** Run `fn` atomically; repository calls made inside it (same async call chain) belong to the transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  insertJob(job: Job): Promise<void>;
  updateJob(id: string, patch: Partial<Omit<Job, "id" | "createdAt">>): Promise<Job>;

  getLatestIntakeAnalysis(jobId: string): Promise<IntakeAnalysis | null>;
  listLatestIntakeAnalyses(): Promise<IntakeAnalysis[]>;
  getIntakeAnalysis(id: string): Promise<IntakeAnalysis | null>;
  insertIntakeAnalysis(a: IntakeAnalysis): Promise<void>;
  updateIntakeAnalysis(id: string, patch: Partial<Omit<IntakeAnalysis, "id" | "jobId" | "createdAt">>): Promise<void>;

  getCurrentWorkflow(jobId: string): Promise<Workflow | null>;
  listCurrentWorkflows(): Promise<Workflow[]>;
  insertWorkflow(w: Workflow): Promise<void>; // inserts steps too
  updateWorkflow(id: string, patch: Partial<Omit<Workflow, "id" | "steps" | "jobId">>): Promise<void>;
  insertStep(step: WorkflowStep): Promise<void>;
  deleteStep(id: string): Promise<void>;
  updateStep(id: string, patch: Partial<Omit<WorkflowStep, "id" | "workflowId">>): Promise<void>;

  listGenerations(jobId: string): Promise<Generation[]>;
  listAllGenerations(): Promise<Generation[]>; // every job at once, for list screens
  listActiveGenerations(): Promise<Generation[]>;
  insertGeneration(g: Generation): Promise<void>;
  updateGeneration(id: string, patch: Partial<Omit<Generation, "id" | "jobId">>): Promise<Generation>;
  getGeneration(id: string): Promise<Generation | null>;

  listRevisions(jobId: string): Promise<Revision[]>;
  listAllRevisions(): Promise<Revision[]>; // every job at once, for list screens
  getRevision(id: string): Promise<Revision | null>;
  insertRevision(r: Revision): Promise<void>;
  updateRevision(id: string, patch: Partial<Omit<Revision, "id" | "jobId">>): Promise<void>;

  listApprovals(jobId?: string): Promise<ApprovalRequest[]>;
  countPendingApprovals(): Promise<number>;
  getApproval(id: string): Promise<ApprovalRequest | null>;
  insertApproval(a: ApprovalRequest): Promise<void>;
  updateApproval(id: string, patch: Partial<Omit<ApprovalRequest, "id" | "jobId">>): Promise<void>;

  listActivity(jobId: string): Promise<ActivityEvent[]>;
  insertActivity(e: ActivityEvent): Promise<void>;

  insertAsset(a: StoredAsset): Promise<void>;
  getAsset(id: string): Promise<StoredAsset | null>;

  // --- supervised autonomy ---
  getAutonomy(): Promise<AutonomySettings | null>;
  upsertAutonomy(s: AutonomySettings): Promise<void>;

  listClientMemory(): Promise<ClientMemory[]>;
  getClientMemory(clientKey: string): Promise<ClientMemory | null>;
  upsertClientMemory(m: ClientMemory): Promise<void>;

  listAgentMessages(jobId?: string): Promise<AgentMessage[]>;
  getAgentMessage(id: string): Promise<AgentMessage | null>;
  insertAgentMessage(m: AgentMessage): Promise<void>;
  updateAgentMessage(id: string, patch: Partial<Omit<AgentMessage, "id" | "jobId">>): Promise<void>;

  listAudit(jobId?: string): Promise<AuditEntry[]>;
  insertAudit(e: AuditEntry): Promise<void>;

  listEscalations(jobId?: string): Promise<Escalation[]>;
  getEscalation(id: string): Promise<Escalation | null>;
  insertEscalation(e: Escalation): Promise<void>;
  updateEscalation(id: string, patch: Partial<Omit<Escalation, "id" | "jobId">>): Promise<void>;

  // --- API keys entered in the UI (values are ciphertext) ---
  listSecrets(): Promise<{ name: string; value: string; updatedAt: string }[]>;
  upsertSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;

  // --- small key/value settings edited in the UI ---
  getSetting(key: string): Promise<string | null>;
  listSettings(): Promise<{ key: string; value: string; updatedAt: string }[]>; // everything except login throttling rows
  setSetting(key: string, value: string): Promise<void>;
  deleteSetting(key: string): Promise<void>;

  // --- client portal ---
  getClientShareByJob(jobId: string): Promise<ClientShare | null>; // newest, revoked or not
  getClientShareByToken(token: string): Promise<ClientShare | null>;
  insertClientShare(s: ClientShare): Promise<void>;
  updateClientShare(id: string, patch: Partial<Omit<ClientShare, "id" | "jobId" | "token">>): Promise<void>;
  listClientFeedback(jobId: string): Promise<ClientFeedback[]>;
  insertClientFeedback(f: ClientFeedback): Promise<void>;

  // --- creative brief (one per job) ---
  getCreativeBrief(jobId: string): Promise<CreativeBriefRecord | null>;
  upsertCreativeBrief(b: CreativeBriefRecord): Promise<void>;

  // --- prompt library ---
  listPrompts(): Promise<SavedPrompt[]>;
  getPrompt(id: string): Promise<SavedPrompt | null>;
  insertPrompt(p: SavedPrompt): Promise<void>;
  updatePrompt(id: string, patch: Partial<Omit<SavedPrompt, "id" | "createdAt">>): Promise<void>;
  deletePrompt(id: string): Promise<void>;
  /** Count one more use without a read-modify-write, so two quick inserts do not lose one. */
  bumpPromptUses(id: string): Promise<void>;

  // --- invoices ---
  listInvoices(): Promise<Invoice[]>;
  listInvoicesForJob(jobId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | null>;
  insertInvoice(inv: Invoice): Promise<void>;
  updateInvoice(id: string, patch: Partial<Omit<Invoice, "id" | "jobId" | "createdAt">>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;

  countJobs(): Promise<number>;
  wipe(): Promise<void>;
}
