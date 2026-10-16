import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  ActivityEvent,
  AgentMessage,
  ApprovalRequest,
  AuditEntry,
  AutonomySettings,
  BriefAnalysis,
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
import type { StudioRepository } from "./repository";

/**
 * Minimal structural type for a synchronous, better-sqlite3-compatible driver.
 * Satisfied by both `better-sqlite3` (local file) and `libsql` (remote Turso),
 * so one repository implementation serves both backends.
 */
export interface SqlStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
  transaction<T>(fn: () => T): () => T;
}

// ---------- generic row <-> object mapping ----------

type FieldSpec = { json?: string[]; bool?: string[]; quoted?: string[] };

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(obj: Record<string, unknown>, spec: FieldSpec) {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (spec.json?.includes(k)) row[snake(k)] = JSON.stringify(v);
    else if (spec.bool?.includes(k)) row[snake(k)] = v ? 1 : 0;
    else row[snake(k)] = v;
  }
  return row;
}

function fromRow<T>(row: Record<string, unknown> | undefined, spec: FieldSpec): T | null {
  if (!row) return null;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "_metadata") continue; // libsql attaches per-row metadata; not a column
    const key = camel(k);
    if (spec.json?.includes(key)) obj[key] = v == null ? null : JSON.parse(String(v));
    else if (spec.bool?.includes(key)) obj[key] = v === 1;
    else obj[key] = v;
  }
  return obj as T;
}

const q = (col: string) => `"${col}"`;

// Positional (?) parameters, not named (@name): libSQL's remote (Hrana) protocol
// does not bind named parameters the way better-sqlite3 and the local file driver
// do, which silently left columns NULL. Positional binds identically everywhere.
function insertSql(table: string, cols: string[]) {
  return `INSERT INTO ${table} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
}

function updateSql(table: string, cols: string[]) {
  return `UPDATE ${table} SET ${cols.map((c) => `${q(c)} = ?`).join(", ")} WHERE id = ?`;
}

const SPEC = {
  job: { json: ["referenceAssets"], bool: ["rightsCleared"] },
  intake: { json: ["original", "edited", "decisionReasons"] },
  workflow: {},
  step: { json: ["inputs", "expectedOutputs", "deliverableIds"] },
  generation: { bool: ["selected"] },
  revision: { bool: ["materialChange", "requiresApproval"] },
  approval: {},
  activity: {},
  asset: {},
  autonomy: { json: ["allowedModelFamilies", "autoSendMessageTypes", "alwaysPause"], bool: ["autoShareConcepts", "finalDeliveryAlwaysApproval"] },
  clientMemory: { json: ["logos", "colors", "fonts", "productDetails", "winningAssets", "rejectedStyles"] },
  message: { bool: ["autoAllowed"] },
  audit: {},
  escalation: {},
} satisfies Record<string, FieldSpec>;

// ---------- repository ----------

export class SqliteStudioRepository implements StudioRepository {
  private db: SqlDatabase;

  // Takes an already-opened driver (see repo/index.ts) so the same SQL serves
  // both the local SQLite file and a remote Turso database. The portable schema
  // is applied idempotently (CREATE TABLE IF NOT EXISTS) on construction.
  constructor(db: SqlDatabase) {
    this.db = db;
    const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/repo/schema.sql"), "utf8");
    this.db.exec(schema);
    this.migrate();
  }

  // Idempotent additive migrations for databases created before a column existed.
  // CREATE TABLE IF NOT EXISTS does not add columns to an existing table, so new
  // nullable columns are added here; a duplicate-column error just means it's present.
  private migrate() {
    for (const sql of ["ALTER TABLE generations ADD COLUMN timed_out_at TEXT", "ALTER TABLE jobs ADD COLUMN template_id TEXT"]) {
      try {
        this.db.exec(sql);
      } catch {
        /* column already exists */
      }
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  private insert(table: string, obj: object, spec: FieldSpec) {
    const row = toRow(obj as Record<string, unknown>, spec);
    const cols = Object.keys(row);
    this.db.prepare(insertSql(table, cols)).run(...cols.map((c) => row[c]));
  }

  private patch(table: string, id: string, patch: object, spec: FieldSpec) {
    const row = toRow(patch as Record<string, unknown>, spec);
    const cols = Object.keys(row);
    if (cols.length === 0) return;
    this.db.prepare(updateSql(table, cols)).run(...cols.map((c) => row[c]), id);
  }

  private all<T>(sql: string, spec: FieldSpec, ...params: unknown[]): T[] {
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map((r) => fromRow<T>(r, spec)!);
  }

  private one<T>(sql: string, spec: FieldSpec, ...params: unknown[]): T | null {
    return fromRow<T>(this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined, spec);
  }

  // jobs
  listJobs() {
    return this.all<Job>("SELECT * FROM jobs ORDER BY created_at DESC", SPEC.job);
  }
  getJob(id: string) {
    return this.one<Job>("SELECT * FROM jobs WHERE id = ?", SPEC.job, id);
  }
  insertJob(job: Job) {
    this.insert("jobs", job, SPEC.job);
  }
  updateJob(id: string, patch: Partial<Job>) {
    this.patch("jobs", id, { ...patch, updatedAt: new Date().toISOString() }, SPEC.job);
    return this.getJob(id)!;
  }
  countJobs() {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
  }

  // intake analyses (structured, with original vs human-edited)
  getLatestIntakeAnalysis(jobId: string) {
    return this.one<IntakeAnalysis>("SELECT * FROM intake_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", SPEC.intake, jobId);
  }
  listLatestIntakeAnalyses() {
    return this.all<IntakeAnalysis>(
      `SELECT a.* FROM intake_analyses a
       JOIN (SELECT job_id, MAX(created_at) AS m FROM intake_analyses GROUP BY job_id) l
       ON a.job_id = l.job_id AND a.created_at = l.m`,
      SPEC.intake,
    );
  }
  getIntakeAnalysis(id: string) {
    return this.one<IntakeAnalysis>("SELECT * FROM intake_analyses WHERE id = ?", SPEC.intake, id);
  }
  insertIntakeAnalysis(a: IntakeAnalysis) {
    this.insert("intake_analyses", a, SPEC.intake);
  }
  updateIntakeAnalysis(id: string, patch: Partial<IntakeAnalysis>) {
    this.patch("intake_analyses", id, patch, SPEC.intake);
  }

  // workflows
  private hydrate(w: Omit<Workflow, "steps"> | null): Workflow | null {
    if (!w) return null;
    const steps = this.all<WorkflowStep>(
      `SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY "order"`,
      SPEC.step,
      w.id,
    );
    return { ...w, steps };
  }
  getCurrentWorkflow(jobId: string) {
    return this.hydrate(
      this.one<Omit<Workflow, "steps">>(
        "SELECT * FROM workflows WHERE job_id = ? AND approval_status != 'superseded' ORDER BY version DESC LIMIT 1",
        SPEC.workflow,
        jobId,
      ),
    );
  }
  listCurrentWorkflows() {
    const rows = this.all<Omit<Workflow, "steps">>(
      `SELECT w.* FROM workflows w
       JOIN (SELECT job_id, MAX(version) AS v FROM workflows WHERE approval_status != 'superseded' GROUP BY job_id) l
       ON w.job_id = l.job_id AND w.version = l.v`,
      SPEC.workflow,
    );
    return rows.map((r) => this.hydrate(r)!);
  }
  insertWorkflow(w: Workflow) {
    const { steps, ...rest } = w;
    this.insert("workflows", rest, SPEC.workflow);
    for (const s of steps) this.insert("workflow_steps", s, SPEC.step);
  }
  updateWorkflow(id: string, patch: Partial<Workflow>) {
    this.patch("workflows", id, patch, SPEC.workflow);
  }
  updateStep(id: string, patch: Partial<WorkflowStep>) {
    this.patch("workflow_steps", id, patch, SPEC.step);
  }

  // generations
  listGenerations(jobId: string) {
    return this.all<Generation>("SELECT * FROM generations WHERE job_id = ? ORDER BY created_at, attempt", SPEC.generation, jobId);
  }
  listActiveGenerations() {
    return this.all<Generation>(
      "SELECT * FROM generations WHERE status IN ('queued','in_progress') ORDER BY created_at",
      SPEC.generation,
    );
  }
  getGeneration(id: string) {
    return this.one<Generation>("SELECT * FROM generations WHERE id = ?", SPEC.generation, id);
  }
  insertGeneration(g: Generation) {
    this.insert("generations", g, SPEC.generation);
  }
  updateGeneration(id: string, patch: Partial<Generation>) {
    this.patch("generations", id, patch, SPEC.generation);
    return this.getGeneration(id)!;
  }

  // revisions
  listRevisions(jobId: string) {
    return this.all<Revision>("SELECT * FROM revisions WHERE job_id = ? ORDER BY created_at DESC", SPEC.revision, jobId);
  }
  getRevision(id: string) {
    return this.one<Revision>("SELECT * FROM revisions WHERE id = ?", SPEC.revision, id);
  }
  insertRevision(r: Revision) {
    this.insert("revisions", r, SPEC.revision);
  }
  updateRevision(id: string, patch: Partial<Revision>) {
    this.patch("revisions", id, patch, SPEC.revision);
  }

  // approvals
  listApprovals(jobId?: string) {
    return jobId
      ? this.all<ApprovalRequest>("SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at", SPEC.approval, jobId)
      : this.all<ApprovalRequest>("SELECT * FROM approvals ORDER BY created_at", SPEC.approval);
  }
  getApproval(id: string) {
    return this.one<ApprovalRequest>("SELECT * FROM approvals WHERE id = ?", SPEC.approval, id);
  }
  insertApproval(a: ApprovalRequest) {
    this.insert("approvals", a, SPEC.approval);
  }
  updateApproval(id: string, patch: Partial<ApprovalRequest>) {
    this.patch("approvals", id, patch, SPEC.approval);
  }

  // activity
  listActivity(jobId: string) {
    return this.all<ActivityEvent>("SELECT * FROM activity WHERE job_id = ? ORDER BY created_at DESC, rowid DESC", SPEC.activity, jobId);
  }
  insertActivity(e: ActivityEvent) {
    this.insert("activity", e, SPEC.activity);
  }

  insertAsset(a: StoredAsset) {
    this.insert("assets", a, SPEC.asset);
  }
  getAsset(id: string) {
    return this.one<StoredAsset>("SELECT * FROM assets WHERE id = ?", SPEC.asset, id);
  }

  // --- supervised autonomy ---
  getAutonomy() {
    return this.one<AutonomySettings>("SELECT * FROM autonomy_settings WHERE id = 'default'", SPEC.autonomy);
  }
  upsertAutonomy(s: AutonomySettings) {
    if (this.getAutonomy()) this.patch("autonomy_settings", "default", { ...s, id: "default" }, SPEC.autonomy);
    else this.insert("autonomy_settings", { ...s, id: "default" }, SPEC.autonomy);
  }

  listClientMemory() {
    return this.all<ClientMemory>("SELECT * FROM client_memory ORDER BY display_name", SPEC.clientMemory);
  }
  getClientMemory(clientKey: string) {
    return this.one<ClientMemory>("SELECT * FROM client_memory WHERE client_key = ?", SPEC.clientMemory, clientKey);
  }
  upsertClientMemory(m: ClientMemory) {
    const existing = this.getClientMemory(m.clientKey);
    if (existing) this.patch("client_memory", existing.id, { ...m, id: existing.id }, SPEC.clientMemory);
    else this.insert("client_memory", m, SPEC.clientMemory);
  }

  listAgentMessages(jobId?: string) {
    return jobId
      ? this.all<AgentMessage>("SELECT * FROM agent_messages WHERE job_id = ? ORDER BY created_at", SPEC.message, jobId)
      : this.all<AgentMessage>("SELECT * FROM agent_messages ORDER BY created_at", SPEC.message);
  }
  getAgentMessage(id: string) {
    return this.one<AgentMessage>("SELECT * FROM agent_messages WHERE id = ?", SPEC.message, id);
  }
  insertAgentMessage(m: AgentMessage) {
    this.insert("agent_messages", m, SPEC.message);
  }
  updateAgentMessage(id: string, patch: Partial<AgentMessage>) {
    this.patch("agent_messages", id, patch, SPEC.message);
  }

  listAudit(jobId?: string) {
    return jobId
      ? this.all<AuditEntry>("SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at, rowid", SPEC.audit, jobId)
      : this.all<AuditEntry>("SELECT * FROM audit_log ORDER BY created_at, rowid", SPEC.audit);
  }
  insertAudit(e: AuditEntry) {
    this.insert("audit_log", e, SPEC.audit);
  }

  listEscalations(jobId?: string) {
    return jobId
      ? this.all<Escalation>("SELECT * FROM escalations WHERE job_id = ? ORDER BY created_at", SPEC.escalation, jobId)
      : this.all<Escalation>("SELECT * FROM escalations ORDER BY created_at", SPEC.escalation);
  }
  getEscalation(id: string) {
    return this.one<Escalation>("SELECT * FROM escalations WHERE id = ?", SPEC.escalation, id);
  }
  insertEscalation(e: Escalation) {
    this.insert("escalations", e, SPEC.escalation);
  }
  updateEscalation(id: string, patch: Partial<Escalation>) {
    this.patch("escalations", id, patch, SPEC.escalation);
  }

  wipe() {
    this.db.exec(
      "DELETE FROM assets; DELETE FROM activity; DELETE FROM approvals; DELETE FROM revisions; DELETE FROM generations; DELETE FROM workflow_steps; DELETE FROM workflows; DELETE FROM intake_analyses; DELETE FROM jobs;",
      "DELETE FROM escalations; DELETE FROM audit_log; DELETE FROM agent_messages; DELETE FROM client_memory; DELETE FROM autonomy_settings; DELETE FROM assets; DELETE FROM activity; DELETE FROM approvals; DELETE FROM revisions; DELETE FROM generations; DELETE FROM workflow_steps; DELETE FROM workflows; DELETE FROM intake_analyses; DELETE FROM brief_analyses; DELETE FROM jobs;",
    );
  }
}
