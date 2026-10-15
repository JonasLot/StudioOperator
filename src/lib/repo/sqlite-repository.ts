import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  ActivityEvent,
  ApprovalRequest,
  BriefAnalysis,
  Generation,
  Job,
  Revision,
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
  analysis: {
    json: [
      "deliverables",
      "dimensions",
      "durations",
      "references",
      "exactText",
      "brandConstraints",
      "rightsConcerns",
      "missingInformation",
      "rationale",
    ],
  },
  workflow: {},
  step: { json: ["inputs", "expectedOutputs", "deliverableIds"] },
  generation: { bool: ["selected"] },
  revision: { bool: ["materialChange", "requiresApproval"] },
  approval: {},
  activity: {},
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

  // analyses
  getLatestAnalysis(jobId: string) {
    return this.one<BriefAnalysis>(
      "SELECT * FROM brief_analyses WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
      SPEC.analysis,
      jobId,
    );
  }
  listLatestAnalyses() {
    return this.all<BriefAnalysis>(
      `SELECT a.* FROM brief_analyses a
       JOIN (SELECT job_id, MAX(created_at) AS m FROM brief_analyses GROUP BY job_id) l
       ON a.job_id = l.job_id AND a.created_at = l.m`,
      SPEC.analysis,
    );
  }
  insertAnalysis(a: BriefAnalysis) {
    this.insert("brief_analyses", a, SPEC.analysis);
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

  wipe() {
    this.db.exec(
      "DELETE FROM activity; DELETE FROM approvals; DELETE FROM revisions; DELETE FROM generations; DELETE FROM workflow_steps; DELETE FROM workflows; DELETE FROM brief_analyses; DELETE FROM jobs;",
    );
  }
}
