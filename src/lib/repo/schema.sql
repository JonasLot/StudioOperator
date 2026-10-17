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
  template_id TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  error TEXT,
  timed_out_at TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_job ON generations(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

-- Completed outputs copied into application-controlled storage, since provider
-- URLs may expire. Bytes are stored base64 so it works on SQLite and libSQL alike.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  source_url TEXT,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_job ON assets(job_id, created_at);

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

-- ---------------------------------------------------------------------------
-- Supervised autonomy: Client Agent messages, autonomy settings, client memory,
-- the autonomy audit log and escalations.
-- ---------------------------------------------------------------------------

-- Single account-level row (id = 'default').
CREATE TABLE IF NOT EXISTS autonomy_settings (
  id TEXT PRIMARY KEY,
  max_auto_spend_per_job_usd REAL NOT NULL,
  max_auto_spend_per_repair_usd REAL NOT NULL,
  max_attempts_per_step INTEGER NOT NULL,
  allowed_model_families TEXT NOT NULL,
  auto_send_message_types TEXT NOT NULL,
  auto_share_concepts INTEGER NOT NULL DEFAULT 0,
  final_delivery_always_approval INTEGER NOT NULL DEFAULT 1,
  always_pause TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Account-level memory about a client, keyed by a normalized client name.
CREATE TABLE IF NOT EXISTS client_memory (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  logos TEXT NOT NULL DEFAULT '[]',
  colors TEXT NOT NULL DEFAULT '[]',
  fonts TEXT NOT NULL DEFAULT '[]',
  tone TEXT,
  product_details TEXT NOT NULL DEFAULT '[]',
  winning_assets TEXT NOT NULL DEFAULT '[]',
  rejected_styles TEXT NOT NULL DEFAULT '[]',
  delivery_preferences TEXT,
  communication_preferences TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_memory_key ON client_memory(client_key);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  auto_allowed INTEGER NOT NULL DEFAULT 0,
  held_reason TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_job ON agent_messages(job_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  cost_delta_usd REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_job ON audit_log(job_id, created_at);

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  reason TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escalations_job ON escalations(job_id, created_at);

-- API keys entered on the Settings page, encrypted at rest (see src/lib/secrets).
-- Not wiped by "reset demo data".
CREATE TABLE IF NOT EXISTS app_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Small key/value store for settings edited in the UI (profile, mock-mode override,
-- login throttling). Not secret; not wiped by "reset demo data".
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Client portal: an unguessable per-job link, and what the client writes back through it.
CREATE TABLE IF NOT EXISTS client_shares (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_viewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_shares_token ON client_shares(token);
CREATE INDEX IF NOT EXISTS idx_client_shares_job ON client_shares(job_id);

CREATE TABLE IF NOT EXISTS client_feedback (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT,
  body TEXT NOT NULL,
  revision_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_feedback_job ON client_feedback(job_id, created_at);
