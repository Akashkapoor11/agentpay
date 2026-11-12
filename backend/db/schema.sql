CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY,
  request_text TEXT NOT NULL,
  agent_mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result JSONB
);

CREATE TABLE IF NOT EXISTS mandates (
  id UUID PRIMARY KEY,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  mandate JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','expired','used','blocked')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS mandates_status_idx ON mandates(status);
CREATE INDEX IF NOT EXISTS mandates_expires_idx ON mandates(expires_at);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id BIGSERIAL PRIMARY KEY,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  mandate_id UUID REFERENCES mandates(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_decisions_run_idx ON agent_decisions(agent_run_id, created_at);
CREATE INDEX IF NOT EXISTS agent_decisions_mandate_idx ON agent_decisions(mandate_id, created_at);

CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGSERIAL PRIMARY KEY,
  mandate_id UUID NOT NULL REFERENCES mandates(id) ON DELETE RESTRICT,
  paypal_order_id TEXT UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating','created','approved','captured','failed')) DEFAULT 'creating',
  cart JSONB NOT NULL,
  policy JSONB NOT NULL,
  paypal_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_orders_mandate_idx ON payment_orders(mandate_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_active_mandate_idx
  ON payment_orders(mandate_id)
  WHERE status IN ('creating','created','approved');

CREATE TABLE IF NOT EXISTS payment_captures (
  id BIGSERIAL PRIMARY KEY,
  payment_order_id BIGINT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  paypal_capture_id TEXT UNIQUE,
  status TEXT NOT NULL,
  amount NUMERIC(12,2),
  currency CHAR(3),
  paypal_response JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_captures_order_idx ON payment_captures(payment_order_id, captured_at);
CREATE UNIQUE INDEX IF NOT EXISTS payment_captures_order_unique_idx ON payment_captures(payment_order_id);


-- Append-only, hash-linked evidence metadata (safe to apply to an existing database).
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS previous_event_hash TEXT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS event_hash TEXT;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS event_payload JSONB;

CREATE TABLE IF NOT EXISTS audit_heads (
  scope TEXT PRIMARY KEY,
  head_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION agentpay_reject_decision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AgentPay decision events are append-only.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_decisions_append_only ON agent_decisions;
CREATE TRIGGER agent_decisions_append_only
BEFORE UPDATE OR DELETE ON agent_decisions
FOR EACH ROW EXECUTE FUNCTION agentpay_reject_decision_mutation();

CREATE TABLE IF NOT EXISTS workflow_reconciliations (
  paypal_capture_id TEXT PRIMARY KEY REFERENCES payment_captures(paypal_capture_id) ON DELETE RESTRICT,
  payment_order_id BIGINT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('RECONCILED')) DEFAULT 'RECONCILED',
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  workflow_run_id TEXT,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workflow_reconciliations_order_idx ON workflow_reconciliations(payment_order_id, reconciled_at);

