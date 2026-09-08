BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agent_runs(
 id UUID PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL,objective TEXT NOT NULL,policy_json JSONB NOT NULL,policy_hash TEXT,
 selected_endpoint_key TEXT,cancel_requested BOOLEAN NOT NULL DEFAULT false,error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ,
 UNIQUE(user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS purchase_intents(run_id UUID PRIMARY KEY REFERENCES agent_runs(id),intent JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_snapshots(
 id BIGSERIAL PRIMARY KEY,run_id UUID NOT NULL REFERENCES agent_runs(id),snapshot JSONB NOT NULL,
 decision JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS execution_attempts(
 id UUID PRIMARY KEY,run_id UUID NOT NULL REFERENCES agent_runs(id),idempotency_key TEXT NOT NULL UNIQUE,
 endpoint_key TEXT NOT NULL,state TEXT NOT NULL,payment_amount NUMERIC(78,36),payment_ref TEXT,
 outcome INTEGER,receipt_hash TEXT UNIQUE,arc_tx_hash TEXT,observation JSONB,signed_receipt JSONB,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ,
 UNIQUE(run_id)
);
CREATE TABLE IF NOT EXISTS evidence_records(
 execution_id UUID PRIMARY KEY REFERENCES execution_attempts(id),evidence_hash TEXT NOT NULL,
 evidence_uri TEXT NOT NULL,evidence_uri_hash TEXT NOT NULL,bundle JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS protected_job_runs(
 id UUID PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,
 job_id NUMERIC(78,0),state TEXT NOT NULL,specification JSONB NOT NULL,deliverable_hash TEXT,
 verdict JSONB,signature TEXT,tx_hash TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS provider_address TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS evaluator_address TEXT;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE protected_job_runs ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC(78,36);
CREATE TABLE IF NOT EXISTS run_events(
 id BIGSERIAL PRIMARY KEY,run_id UUID NOT NULL REFERENCES agent_runs(id),type TEXT NOT NULL,data JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_events_cursor ON run_events(run_id,id);
CREATE INDEX IF NOT EXISTS runs_owner ON agent_runs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS executions_pending ON execution_attempts(state,started_at);
CREATE SEQUENCE IF NOT EXISTS witness_nonce AS BIGINT MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS evaluator_nonce AS BIGINT MINVALUE 1;
COMMIT;
