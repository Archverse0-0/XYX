BEGIN;
CREATE TABLE IF NOT EXISTS provider_selections (
  selection_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  selection_hash TEXT NOT NULL UNIQUE,
  result JSONB NOT NULL,
  consumed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS selection_id TEXT REFERENCES provider_selections(selection_id);
CREATE INDEX IF NOT EXISTS provider_selections_owner ON provider_selections(user_id,created_at DESC);
COMMIT;
