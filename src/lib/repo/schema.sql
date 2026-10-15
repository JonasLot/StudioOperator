-- Portable schema (SQLite now, Postgres later).
-- JSON columns are TEXT here; in Postgres use JSONB. Booleans are INTEGER 0/1 here; BOOLEAN in Postgres.
-- Money is stored as REAL USD for the demo; use NUMERIC(12,2) in Postgres.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  client_name TEXT,
  raw_brief TEXT NOT NULL,
  budget REAL NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL,
  client_notes TEXT,
  reference_assets TEXT NOT NULL DEFAULT '[]',
  source_fee_pct REAL NOT NULL DEFAULT 0,
  contingency_pct REAL NOT NULL DEFAULT 0.2,
  rights_cleared INTEGER NOT NULL DEFAULT 0,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brief_analyses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  analyzer TEXT NOT NULL,
  summary TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  durations TEXT NOT NULL,
  "references" TEXT NOT NULL,
  exact_text TEXT NOT NULL,
  brand_constraints TEXT NOT NULL,
  rights_concerns TEXT NOT NULL,
  missing_information TEXT NOT NULL,
  confidence REAL NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  estimated_shots INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_job ON brief_analyses(job_id, created_at);

-- Structured intake analysis (OpenAI Responses / mock) + the app's deterministic
-- decision. `original` and `edited` hold the full analysis JSON so the model's
-- output and the human-reviewed version can be compared.
CREATE TABLE IF NOT EXISTS intake_analyses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  analyzer TEXT NOT NULL,
  original TEXT NOT NULL,
  edited TEXT,
  decision TEXT NOT NULL,
  decision_reasons TEXT NOT NULL,
  estimated_spend REAL NOT NULL,
  review_status TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  warning TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intake_job ON intake_analyses(job_id, created_at);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  approval_status TEXT NOT NULL,
  max_budget REAL NOT NULL,
  estimated_total_cost REAL NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflows_job ON workflows(job_id, version);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  model_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  inputs TEXT NOT NULL,
  expected_outputs TEXT NOT NULL,
  deliverable_ids TEXT NOT NULL,
  estimated_attempts INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  estimated_total_cost REAL NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps(workflow_id, "order");

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  revision_id TEXT,
  attempt INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_request_id TEXT,
  status_url TEXT,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  cost_estimate REAL NOT NULL,
  actual_cost REAL,
  output_url TEXT,
  output_type TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_job ON generations(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_note TEXT NOT NULL,
  affected_deliverable TEXT,
  recommended_action TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  model_id TEXT,
  attempts INTEGER NOT NULL,
  expected_incremental_cost REAL NOT NULL,
  material_change INTEGER NOT NULL,
  requires_approval INTEGER NOT NULL,
  approval_reason TEXT,
  approval_status TEXT NOT NULL,
  run_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount REAL,
  ref_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_job ON approvals(job_id, created_at);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_job ON activity(job_id, created_at);
