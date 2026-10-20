import "server-only";
import fs from "node:fs";
import path from "node:path";
import { schemaVersion } from "./schema-version";
import type { Row, SqlDriver } from "./driver";
import type {
  ActivityEvent,
  AgentMessage,
  ApprovalRequest,
  AuditEntry,
  AutonomySettings,
  ClientFeedback,
  ClientMemory,
  ClientShare,
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
    if (k === "_metadata" || k === "seq") continue; // driver bookkeeping, not a column of the record
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
  step: { json: ["inputs", "expectedOutputs", "deliverableIds"], bool: ["requiresReview"] },
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
  share: {},
  feedback: {},
} satisfies Record<string, FieldSpec>;

// Additive column migrations for databases created before a column existed.
export const MIGRATIONS = [
  "ALTER TABLE generations ADD COLUMN timed_out_at TEXT",
  "ALTER TABLE jobs ADD COLUMN template_id TEXT",
  "ALTER TABLE generations ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'",
  "ALTER TABLE generations ADD COLUMN review_note TEXT",
  "ALTER TABLE workflow_steps ADD COLUMN requires_review INTEGER NOT NULL DEFAULT 1",
];

// ---------- repository ----------

/**
 * One repository for every database: the SQL is written once with `?` placeholders and runs on
 * SQLite, libSQL (Turso) or Postgres through a SqlDriver. The portable schema is applied once per
 * schema version (see SqlDriver.applySchema) before the first statement runs.
 */
export class SqlStudioRepository implements StudioRepository {
  private ready: Promise<void>;
  // Insertion order for tables ordered "as written": SQLite has rowid, Postgres has the explicit seq column.
  private readonly seq: string;

  constructor(private db: SqlDriver) {
    this.seq = db.dialect === "postgres" ? "seq" : "rowid";
    const schema = fs.readFileSync(path.join(process.cwd(), "src/lib/repo/schema.sql"), "utf8");
    this.ready = db.applySchema(schema, MIGRATIONS, schemaVersion(schema, MIGRATIONS));
    // A failed start must be retried on the next call rather than poisoning every later one.
    this.ready.catch(() => {});
  }

  private async rows(sql: string, params: unknown[] = []): Promise<Row[]> {
    await this.ready;
    return this.db.query(sql, params);
  }

  private async exec(sql: string, params: unknown[] = []): Promise<void> {
    await this.ready;
    await this.db.run(sql, params);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.ready;
    return this.db.transaction(fn);
  }

  private async insert(table: string, obj: object, spec: FieldSpec) {
    const row = toRow(obj as Record<string, unknown>, spec);
    const cols = Object.keys(row);
    await this.exec(insertSql(table, cols), cols.map((c) => row[c]));
  }

  private async patch(table: string, id: string, patch: object, spec: FieldSpec) {
    const row = toRow(patch as Record<string, unknown>, spec);
    const cols = Object.keys(row);
    if (cols.length === 0) return;
    await this.exec(updateSql(table, cols), [...cols.map((c) => row[c]), id]);
  }

  private async all<T>(sql: string, spec: FieldSpec, ...params: unknown[]): Promise<T[]> {
    return (await this.rows(sql, params)).map((r) => fromRow<T>(r, spec)!);
  }

  private async one<T>(sql: string, spec: FieldSpec, ...params: unknown[]): Promise<T | null> {
    return fromRow<T>((await this.rows(sql, params))[0], spec);
  }

  // jobs
  async listJobs() {
    return await this.all<Job>("SELECT * FROM jobs ORDER BY created_at DESC", SPEC.job);
  }
  async getJob(id: string) {
    return await this.one<Job>("SELECT * FROM jobs WHERE id = ?", SPEC.job, id);
  }
  async insertJob(job: Job) {
    await this.insert("jobs", job, SPEC.job);
  }
  async updateJob(id: string, patch: Partial<Job>) {
    await this.patch("jobs", id, { ...patch, updatedAt: new Date().toISOString() }, SPEC.job);
    return (await this.getJob(id))!;
  }
  async countJobs() {
    return Number((await this.rows("SELECT COUNT(*) AS n FROM jobs"))[0].n);
  }

  // intake analyses (structured, with original vs human-edited)
  async getLatestIntakeAnalysis(jobId: string) {
    return await this.one<IntakeAnalysis>("SELECT * FROM intake_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", SPEC.intake, jobId);
  }
  async listLatestIntakeAnalyses() {
    return await this.all<IntakeAnalysis>(
      `SELECT a.* FROM intake_analyses a
       JOIN (SELECT job_id, MAX(created_at) AS m FROM intake_analyses GROUP BY job_id) l
       ON a.job_id = l.job_id AND a.created_at = l.m`,
      SPEC.intake,
    );
  }
  async getIntakeAnalysis(id: string) {
    return await this.one<IntakeAnalysis>("SELECT * FROM intake_analyses WHERE id = ?", SPEC.intake, id);
  }
  async insertIntakeAnalysis(a: IntakeAnalysis) {
    await this.insert("intake_analyses", a, SPEC.intake);
  }
  async updateIntakeAnalysis(id: string, patch: Partial<IntakeAnalysis>) {
    await this.patch("intake_analyses", id, patch, SPEC.intake);
  }

  // workflows
  private async hydrate(w: Omit<Workflow, "steps"> | null): Promise<Workflow | null> {
    if (!w) return null;
    const steps = await this.all<WorkflowStep>(
      `SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY "order"`,
      SPEC.step,
      w.id,
    );
    return { ...w, steps };
  }
  async getCurrentWorkflow(jobId: string) {
    return this.hydrate(
      await this.one<Omit<Workflow, "steps">>(
        "SELECT * FROM workflows WHERE job_id = ? AND approval_status != 'superseded' ORDER BY version DESC LIMIT 1",
        SPEC.workflow,
        jobId,
      ),
    );
  }
  async listCurrentWorkflows() {
    const rows = await this.all<Omit<Workflow, "steps">>(
      `SELECT w.* FROM workflows w
       JOIN (SELECT job_id, MAX(version) AS v FROM workflows WHERE approval_status != 'superseded' GROUP BY job_id) l
       ON w.job_id = l.job_id AND w.version = l.v`,
      SPEC.workflow,
    );
    if (!rows.length) return [];
    // One query for every workflow's steps (hydrate() would be one query per workflow).
    const steps = await this.all<WorkflowStep>(
      `SELECT * FROM workflow_steps WHERE workflow_id IN (${rows.map(() => "?").join(",")}) ORDER BY "order"`,
      SPEC.step,
      ...rows.map((r) => r.id),
    );
    return rows.map((r) => ({ ...r, steps: steps.filter((st) => st.workflowId === r.id) }));
  }
  async insertWorkflow(w: Workflow) {
    const { steps, ...rest } = w;
    await this.insert("workflows", rest, SPEC.workflow);
    for (const s of steps) await this.insert("workflow_steps", s, SPEC.step);
  }
  async updateWorkflow(id: string, patch: Partial<Workflow>) {
    await this.patch("workflows", id, patch, SPEC.workflow);
  }
  async insertStep(step: WorkflowStep) {
    await this.insert("workflow_steps", step, SPEC.step);
  }
  async deleteStep(id: string) {
    await this.exec("DELETE FROM workflow_steps WHERE id = ?", [id]);
  }
  async updateStep(id: string, patch: Partial<WorkflowStep>) {
    await this.patch("workflow_steps", id, patch, SPEC.step);
  }

  // generations
  async listGenerations(jobId: string) {
    return await this.all<Generation>("SELECT * FROM generations WHERE job_id = ? ORDER BY created_at, attempt", SPEC.generation, jobId);
  }
  async listAllGenerations() {
    return await this.all<Generation>("SELECT * FROM generations ORDER BY created_at, attempt", SPEC.generation);
  }
  async listActiveGenerations() {
    return await this.all<Generation>(
      "SELECT * FROM generations WHERE status IN ('queued','in_progress') ORDER BY created_at",
      SPEC.generation,
    );
  }
  async getGeneration(id: string) {
    return await this.one<Generation>("SELECT * FROM generations WHERE id = ?", SPEC.generation, id);
  }
  async insertGeneration(g: Generation) {
    await this.insert("generations", g, SPEC.generation);
  }
  async updateGeneration(id: string, patch: Partial<Generation>) {
    await this.patch("generations", id, patch, SPEC.generation);
    return (await this.getGeneration(id))!;
  }

  // revisions
  async listRevisions(jobId: string) {
    return await this.all<Revision>("SELECT * FROM revisions WHERE job_id = ? ORDER BY created_at DESC", SPEC.revision, jobId);
  }
  async listAllRevisions() {
    return await this.all<Revision>("SELECT * FROM revisions ORDER BY created_at DESC", SPEC.revision);
  }
  async getRevision(id: string) {
    return await this.one<Revision>("SELECT * FROM revisions WHERE id = ?", SPEC.revision, id);
  }
  async insertRevision(r: Revision) {
    await this.insert("revisions", r, SPEC.revision);
  }
  async updateRevision(id: string, patch: Partial<Revision>) {
    await this.patch("revisions", id, patch, SPEC.revision);
  }

  // approvals
  async listApprovals(jobId?: string) {
    return jobId
      ? this.all<ApprovalRequest>("SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at", SPEC.approval, jobId)
      : this.all<ApprovalRequest>("SELECT * FROM approvals ORDER BY created_at", SPEC.approval);
  }
  async countPendingApprovals() {
    return Number((await this.rows("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'"))[0].n);
  }
  async getApproval(id: string) {
    return await this.one<ApprovalRequest>("SELECT * FROM approvals WHERE id = ?", SPEC.approval, id);
  }
  async insertApproval(a: ApprovalRequest) {
    await this.insert("approvals", a, SPEC.approval);
  }
  async updateApproval(id: string, patch: Partial<ApprovalRequest>) {
    await this.patch("approvals", id, patch, SPEC.approval);
  }

  // activity
  async listActivity(jobId: string) {
    return await this.all<ActivityEvent>(`SELECT * FROM activity WHERE job_id = ? ORDER BY created_at DESC, ${this.seq} DESC`, SPEC.activity, jobId);
  }
  async insertActivity(e: ActivityEvent) {
    await this.insert("activity", e, SPEC.activity);
  }

  async insertAsset(a: StoredAsset) {
    await this.insert("assets", a, SPEC.asset);
  }
  async getAsset(id: string) {
    return await this.one<StoredAsset>("SELECT * FROM assets WHERE id = ?", SPEC.asset, id);
  }

  // --- supervised autonomy ---
  async getAutonomy() {
    return await this.one<AutonomySettings>("SELECT * FROM autonomy_settings WHERE id = 'default'", SPEC.autonomy);
  }
  async upsertAutonomy(s: AutonomySettings) {
    if (await this.getAutonomy()) await this.patch("autonomy_settings", "default", { ...s, id: "default" }, SPEC.autonomy);
    else await this.insert("autonomy_settings", { ...s, id: "default" }, SPEC.autonomy);
  }

  async listClientMemory() {
    return await this.all<ClientMemory>("SELECT * FROM client_memory ORDER BY display_name", SPEC.clientMemory);
  }
  async getClientMemory(clientKey: string) {
    return await this.one<ClientMemory>("SELECT * FROM client_memory WHERE client_key = ?", SPEC.clientMemory, clientKey);
  }
  async upsertClientMemory(m: ClientMemory) {
    const existing = await this.getClientMemory(m.clientKey);
    if (existing) await this.patch("client_memory", existing.id, { ...m, id: existing.id }, SPEC.clientMemory);
    else await this.insert("client_memory", m, SPEC.clientMemory);
  }

  async listAgentMessages(jobId?: string) {
    return jobId
      ? this.all<AgentMessage>("SELECT * FROM agent_messages WHERE job_id = ? ORDER BY created_at", SPEC.message, jobId)
      : this.all<AgentMessage>("SELECT * FROM agent_messages ORDER BY created_at", SPEC.message);
  }
  async getAgentMessage(id: string) {
    return await this.one<AgentMessage>("SELECT * FROM agent_messages WHERE id = ?", SPEC.message, id);
  }
  async insertAgentMessage(m: AgentMessage) {
    await this.insert("agent_messages", m, SPEC.message);
  }
  async updateAgentMessage(id: string, patch: Partial<AgentMessage>) {
    await this.patch("agent_messages", id, patch, SPEC.message);
  }

  async listAudit(jobId?: string) {
    return jobId
      ? this.all<AuditEntry>(`SELECT * FROM audit_log WHERE job_id = ? ORDER BY created_at, ${this.seq}`, SPEC.audit, jobId)
      : this.all<AuditEntry>(`SELECT * FROM audit_log ORDER BY created_at, ${this.seq}`, SPEC.audit);
  }
  async insertAudit(e: AuditEntry) {
    await this.insert("audit_log", e, SPEC.audit);
  }

  async listEscalations(jobId?: string) {
    return jobId
      ? this.all<Escalation>("SELECT * FROM escalations WHERE job_id = ? ORDER BY created_at", SPEC.escalation, jobId)
      : this.all<Escalation>("SELECT * FROM escalations ORDER BY created_at", SPEC.escalation);
  }
  async getEscalation(id: string) {
    return await this.one<Escalation>("SELECT * FROM escalations WHERE id = ?", SPEC.escalation, id);
  }
  async insertEscalation(e: Escalation) {
    await this.insert("escalations", e, SPEC.escalation);
  }
  async updateEscalation(id: string, patch: Partial<Escalation>) {
    await this.patch("escalations", id, patch, SPEC.escalation);
  }

  // --- small key/value settings edited in the UI ---
  async getSetting(key: string) {
    const row = (await this.rows("SELECT value FROM app_settings WHERE key = ?", [key]))[0];
    return row ? String(row.value) : null;
  }
  async listSettings() {
    return (await this.rows("SELECT key, value, updated_at FROM app_settings WHERE key NOT LIKE 'login:%'")).map((r) => ({
      key: String(r.key),
      value: String(r.value),
      updatedAt: String(r.updated_at),
    }));
  }
  async setSetting(key: string, value: string) {
    await this.exec(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, value, new Date().toISOString()],
    );
  }
  async deleteSetting(key: string) {
    await this.exec("DELETE FROM app_settings WHERE key = ?", [key]);
  }

  // --- API keys entered in the UI ---
  async listSecrets() {
    return (await this.rows("SELECT name, value, updated_at FROM app_secrets")).map((r) => ({
      name: String(r.name),
      value: String(r.value),
      updatedAt: String(r.updated_at),
    }));
  }
  async upsertSecret(name: string, value: string) {
    await this.exec(
      "INSERT INTO app_secrets (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [name, value, new Date().toISOString()],
    );
  }
  async deleteSecret(name: string) {
    await this.exec("DELETE FROM app_secrets WHERE name = ?", [name]);
  }

  // --- client portal ---
  async getClientShareByJob(jobId: string) {
    return await this.one<ClientShare>("SELECT * FROM client_shares WHERE job_id = ? ORDER BY created_at DESC LIMIT 1", SPEC.share, jobId);
  }
  async getClientShareByToken(token: string) {
    return await this.one<ClientShare>("SELECT * FROM client_shares WHERE token = ?", SPEC.share, token);
  }
  async insertClientShare(s: ClientShare) {
    await this.insert("client_shares", s, SPEC.share);
  }
  async updateClientShare(id: string, patch: Partial<Omit<ClientShare, "id" | "jobId" | "token">>) {
    await this.patch("client_shares", id, patch, SPEC.share);
  }
  async listClientFeedback(jobId: string) {
    return await this.all<ClientFeedback>(`SELECT * FROM client_feedback WHERE job_id = ? ORDER BY created_at, id`, SPEC.feedback, jobId);
  }
  async insertClientFeedback(f: ClientFeedback) {
    await this.insert("client_feedback", f, SPEC.feedback);
  }

  async wipe() {
    await this.ready;
    await this.db.exec(
      "DELETE FROM client_feedback; DELETE FROM client_shares; DELETE FROM escalations; DELETE FROM audit_log; DELETE FROM agent_messages; DELETE FROM client_memory; DELETE FROM autonomy_settings; DELETE FROM assets; DELETE FROM activity; DELETE FROM approvals; DELETE FROM revisions; DELETE FROM generations; DELETE FROM workflow_steps; DELETE FROM workflows; DELETE FROM intake_analyses; DELETE FROM jobs;",
    );
  }
}
