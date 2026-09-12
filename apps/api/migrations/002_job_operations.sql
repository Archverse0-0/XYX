BEGIN;
-- Operational journals only; confirmed chain events remain settlement authority.
CREATE TABLE IF NOT EXISTS job_operations (
  id UUID PRIMARY KEY,
  job_run_id UUID NOT NULL REFERENCES protected_job_runs(id),
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('IN_FLIGHT','CONFIRMED','RECONCILIATION_REQUIRED')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_run_id, operation)
);
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS deliverable_uri TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS submission_tx_hash TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS evaluation_evidence_uri TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS commerce_address TEXT;
COMMIT;
