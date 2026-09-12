BEGIN;
-- Reconciliation fields for deterministic crash recovery.
-- Canonical Arc/ERC-8183 state is settlement authority.
-- These fields support operational recovery, not replace canonical truth.

ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS external_operation_id TEXT;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS broadcast_at TIMESTAMPTZ;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS reconciliation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS last_reconciliation_at TIMESTAMPTZ;
ALTER TABLE job_operations ADD COLUMN IF NOT EXISTS canonical_snapshot JSONB;

-- Index for reconciliation queries: find uncertain operations per run.
CREATE INDEX IF NOT EXISTS job_operations_reconcile ON job_operations(job_run_id, state, operation) WHERE state IN ('IN_FLIGHT','RECONCILIATION_REQUIRED');
COMMIT;
