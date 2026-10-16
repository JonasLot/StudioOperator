import type {
  ActivityEvent,
  AgentMessage,
  ApprovalRequest,
  AuditEntry,
  AutonomySettings,
  ClientMemory,
  Escalation,
  Generation,
  IntakeAnalysis,
  Job,
  Revision,
  StoredAsset,
  Workflow,
  WorkflowStep,
} from "@/lib/domain/types";

/**
 * Persistence boundary. Everything above this interface (services, UI) is storage-agnostic.
 * The local demo uses SQLite (sqlite-repository.ts). A Postgres implementation only needs
 * to satisfy this interface — the schema in schema.sql is written to be portable.
 */
export interface StudioRepository {
  transaction<T>(fn: () => T): T;

  listJobs(): Job[];
  getJob(id: string): Job | null;
  insertJob(job: Job): void;
  updateJob(id: string, patch: Partial<Omit<Job, "id" | "createdAt">>): Job;

  getLatestIntakeAnalysis(jobId: string): IntakeAnalysis | null;
  listLatestIntakeAnalyses(): IntakeAnalysis[];
  getIntakeAnalysis(id: string): IntakeAnalysis | null;
  insertIntakeAnalysis(a: IntakeAnalysis): void;
  updateIntakeAnalysis(id: string, patch: Partial<Omit<IntakeAnalysis, "id" | "jobId" | "createdAt">>): void;

  getCurrentWorkflow(jobId: string): Workflow | null;
  listCurrentWorkflows(): Workflow[];
  insertWorkflow(w: Workflow): void; // inserts steps too
  updateWorkflow(id: string, patch: Partial<Omit<Workflow, "id" | "steps" | "jobId">>): void;
  updateStep(id: string, patch: Partial<Omit<WorkflowStep, "id" | "workflowId">>): void;

  listGenerations(jobId: string): Generation[];
  listActiveGenerations(): Generation[];
  insertGeneration(g: Generation): void;
  updateGeneration(id: string, patch: Partial<Omit<Generation, "id" | "jobId">>): Generation;
  getGeneration(id: string): Generation | null;

  listRevisions(jobId: string): Revision[];
  getRevision(id: string): Revision | null;
  insertRevision(r: Revision): void;
  updateRevision(id: string, patch: Partial<Omit<Revision, "id" | "jobId">>): void;

  listApprovals(jobId?: string): ApprovalRequest[];
  getApproval(id: string): ApprovalRequest | null;
  insertApproval(a: ApprovalRequest): void;
  updateApproval(id: string, patch: Partial<Omit<ApprovalRequest, "id" | "jobId">>): void;

  listActivity(jobId: string): ActivityEvent[];
  insertActivity(e: ActivityEvent): void;

  insertAsset(a: StoredAsset): void;
  getAsset(id: string): StoredAsset | null;

  // --- supervised autonomy ---
  getAutonomy(): AutonomySettings | null;
  upsertAutonomy(s: AutonomySettings): void;

  listClientMemory(): ClientMemory[];
  getClientMemory(clientKey: string): ClientMemory | null;
  upsertClientMemory(m: ClientMemory): void;

  listAgentMessages(jobId?: string): AgentMessage[];
  getAgentMessage(id: string): AgentMessage | null;
  insertAgentMessage(m: AgentMessage): void;
  updateAgentMessage(id: string, patch: Partial<Omit<AgentMessage, "id" | "jobId">>): void;

  listAudit(jobId?: string): AuditEntry[];
  insertAudit(e: AuditEntry): void;

  listEscalations(jobId?: string): Escalation[];
  getEscalation(id: string): Escalation | null;
  insertEscalation(e: Escalation): void;
  updateEscalation(id: string, patch: Partial<Omit<Escalation, "id" | "jobId">>): void;

  countJobs(): number;
  wipe(): void;
}
