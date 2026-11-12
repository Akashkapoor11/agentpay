import pg from 'pg';
import { createHash } from 'node:crypto';

const { Pool } = pg;

let pool;
let schemaPromise;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Add the PostgreSQL connection string to run AgentPay with persistence.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

const SCHEMA_SQL = `
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
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_active_mandate_idx ON payment_orders(mandate_id) WHERE status IN ('creating','created','approved');
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
`;

export async function ensureDatabase() {
  if (!schemaPromise) {
    schemaPromise = getPool().query(SCHEMA_SQL).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function createAgentRun({ id, request, agentMode, result }) {
  await ensureDatabase();
  await getPool().query(
    `INSERT INTO agent_runs (id, request_text, agent_mode, status, result)
     VALUES ($1, $2, $3, 'planned', $4::jsonb)`,
    [id, request, agentMode, JSON.stringify(result)]
  );
}

export async function createMandateRecord({ id, agentRunId, mandate, status = 'active' }) {
  await ensureDatabase();
  await getPool().query(
    `INSERT INTO mandates (id, agent_run_id, fingerprint, title, mandate, status, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [id, agentRunId || null, mandate.fingerprint, mandate.title, JSON.stringify(mandate), status, new Date(mandate.expiresAt)]
  );
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hashAuditEvent(previousHash, payload) {
  return createHash('sha256').update(`${previousHash}.${stableJson(payload)}`).digest('hex');
}

async function appendDecisionEventsWithClient(client, { agentRunId, mandateId, events = [] }) {
  if (!events.length) return [];
  const scope = mandateId || 'GLOBAL';
  const genesis = createHash('sha256').update(`AGENTPAY-AUDIT-GENESIS:${scope}`).digest('hex');
  await client.query(
    `INSERT INTO audit_heads (scope, head_hash) VALUES ($1, $2)
     ON CONFLICT (scope) DO NOTHING`,
    [scope, genesis]
  );
  const headResult = await client.query('SELECT head_hash FROM audit_heads WHERE scope = $1 FOR UPDATE', [scope]);
  let previousHash = headResult.rows[0]?.head_hash || genesis;
  const inserted = [];
  for (const event of events) {
    const createdAt = new Date().toISOString();
    const payload = {
      agentRunId: agentRunId || null,
      mandateId: mandateId || null,
      stage: String(event.stage || 'Agent'),
      action: String(event.action || ''),
      result: String(event.result || ''),
      metadata: event.metadata || {},
      createdAt
    };
    const eventHash = hashAuditEvent(previousHash, payload);
    const result = await client.query(
      `INSERT INTO agent_decisions (agent_run_id, mandate_id, stage, action, result, metadata, created_at, previous_event_hash, event_hash, event_payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb)
       RETURNING id, event_hash`,
      [payload.agentRunId, payload.mandateId, payload.stage, payload.action, payload.result, JSON.stringify(payload.metadata), createdAt, previousHash, eventHash, JSON.stringify(payload)]
    );
    inserted.push(result.rows[0]);
    previousHash = eventHash;
  }
  await client.query('UPDATE audit_heads SET head_hash = $2, updated_at = NOW() WHERE scope = $1', [scope, previousHash]);
  return inserted;
}

export async function addDecisionEvents({ agentRunId, mandateId, events = [] }) {
  if (!events.length) return;
  await ensureDatabase();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await appendDecisionEventsWithClient(client, { agentRunId, mandateId, events });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Atomically records a verified workflow reconciliation and its hash-linked ledger event. */
export async function recordWorkflowReconciliation({ captureId, paymentOrderId, amount, currency, workflowRunId = null, paypalOrderId = null }) {
  await ensureDatabase();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const verified = await client.query(
      `SELECT pc.paypal_capture_id, pc.payment_order_id, pc.status AS capture_status,
              pc.amount::text AS capture_amount, pc.currency AS capture_currency,
              po.mandate_id, m.agent_run_id, po.status AS order_status,
              po.amount::text AS order_amount, po.currency AS order_currency
       FROM payment_captures pc
       JOIN payment_orders po ON po.id = pc.payment_order_id
       JOIN mandates m ON m.id = po.mandate_id
       WHERE pc.paypal_capture_id = $1
       FOR UPDATE OF pc, po`,
      [captureId]
    );
    const row = verified.rows[0];
    if (!row || Number(row.payment_order_id) !== Number(paymentOrderId) || row.capture_status !== 'COMPLETED' || row.order_status !== 'captured') {
      throw new Error('Reconciliation does not match a completed AgentPay capture.');
    }
    const amountCents = Math.round(Number(amount) * 100);
    const captureCents = Math.round(Number(row.capture_amount) * 100);
    const orderCents = Math.round(Number(row.order_amount) * 100);
    const safeCurrency = String(currency || '').toUpperCase();
    if (!Number.isSafeInteger(amountCents) || amountCents !== captureCents || amountCents !== orderCents || safeCurrency !== row.capture_currency?.trim() || safeCurrency !== row.order_currency?.trim()) {
      throw new Error('Reconciliation amount or currency differs from the verified PayPal capture.');
    }
    const inserted = await client.query(
      `INSERT INTO workflow_reconciliations (paypal_capture_id, payment_order_id, amount, currency, workflow_run_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (paypal_capture_id) DO NOTHING
       RETURNING *`,
      [captureId, paymentOrderId, (amountCents / 100).toFixed(2), safeCurrency, workflowRunId]
    );
    if (inserted.rows[0]) {
      await appendDecisionEventsWithClient(client, {
        agentRunId: row.agent_run_id,
        mandateId: row.mandate_id,
        events: [{
          stage: 'Render Workflow',
          action: 'Durably reconciled a verified PayPal capture into the AgentPay evidence ledger.',
          result: 'RECONCILED',
          metadata: { paypalOrderId, paypalCaptureId: captureId, amount: amountCents / 100, currency: safeCurrency, workflowRunId: workflowRunId || null }
        }]
      });
    } else {
      const existing = await client.query('SELECT * FROM workflow_reconciliations WHERE paypal_capture_id = $1 LIMIT 1', [captureId]);
      const existingRow = existing.rows[0];
      if (!existingRow || Number(existingRow.payment_order_id) !== Number(paymentOrderId) || Math.round(Number(existingRow.amount) * 100) !== amountCents || existingRow.currency?.trim() !== safeCurrency) {
        throw new Error('Existing reconciliation record conflicts with the verified capture.');
      }
    }
    await client.query('COMMIT');
    const record = inserted.rows[0] || (await getPool().query('SELECT * FROM workflow_reconciliations WHERE paypal_capture_id = $1 LIMIT 1', [captureId])).rows[0];
    return { record, created: Boolean(inserted.rows[0]) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAgentRunById(id) {
  await ensureDatabase();
  const { rows } = await getPool().query('SELECT * FROM agent_runs WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

export async function getMandateById(id) {
  await ensureDatabase();
  const { rows } = await getPool().query('SELECT * FROM mandates WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

export async function markMandateStatus(id, status) {
  await ensureDatabase();
  await getPool().query('UPDATE mandates SET status = $2 WHERE id = $1', [id, status]);
}

export async function createPaymentOrderRecord({ mandateId, requestId, amount, currency, cart, policy }) {
  await ensureDatabase();
  const db = getPool();
  const existingByRequest = await db.query(
    `SELECT * FROM payment_orders
     WHERE request_id = $1
     ORDER BY id DESC LIMIT 1`,
    [requestId]
  );
  if (existingByRequest.rows[0]) return existingByRequest.rows[0];
  const existing = await db.query(
    `SELECT * FROM payment_orders
     WHERE mandate_id = $1 AND status IN ('creating','created','approved')
     ORDER BY id DESC LIMIT 1`,
    [mandateId]
  );
  if (existing.rows[0]) return existing.rows[0];
  try {
    const result = await db.query(
      `INSERT INTO payment_orders (mandate_id, request_id, amount, currency, status, cart, policy)
       VALUES ($1, $2, $3, $4, 'creating', $5::jsonb, $6::jsonb)
       RETURNING *`,
      [mandateId, requestId, amount, currency, JSON.stringify(cart), JSON.stringify(policy)]
    );
    return result.rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      const retry = await db.query(
        `SELECT * FROM payment_orders
         WHERE mandate_id = $1 AND status IN ('creating','created','approved')
         ORDER BY id DESC LIMIT 1`,
        [mandateId]
      );
      if (retry.rows[0]) return retry.rows[0];
    }
    throw error;
  }
}

export async function setPaymentOrderCreated({ id, paypalOrderId, response }) {
  await ensureDatabase();
  const { rows } = await getPool().query(
    `UPDATE payment_orders
     SET paypal_order_id = $2, status = 'created', paypal_response = $3::jsonb, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, paypalOrderId, JSON.stringify(response)]
  );
  return rows[0] || null;
}

export async function setPaymentOrderFailed(id, response) {
  await ensureDatabase();
  await getPool().query(
    `UPDATE payment_orders SET status = 'failed', paypal_response = $2::jsonb, updated_at = NOW()
     WHERE id = $1 AND status = 'creating' AND paypal_order_id IS NULL`,
    [id, JSON.stringify(response || {})]
  );
}

export async function getPaymentOrderByPayPalId(paypalOrderId) {
  await ensureDatabase();
  const { rows } = await getPool().query(
    `SELECT po.*, m.mandate, m.fingerprint, m.expires_at, m.status AS mandate_status, m.agent_run_id
     FROM payment_orders po
     JOIN mandates m ON m.id = po.mandate_id
     WHERE po.paypal_order_id = $1 LIMIT 1`,
    [paypalOrderId]
  );
  return rows[0] || null;
}

export async function markOrderApproved(id) {
  await ensureDatabase();
  await getPool().query(
    `UPDATE payment_orders SET status = 'approved', updated_at = NOW()
     WHERE id = $1 AND status = 'created'`,
    [id]
  );
}

export async function recordCapture({ paymentOrderId, captureId, status, amount, currency, response, mandateId, agentRunId, paypalOrderId }) {
  await ensureDatabase();
  if (!captureId || status !== 'COMPLETED') throw new Error('Only a completed PayPal capture can be recorded.');
  const amountCents = Math.round(Number(amount) * 100);
  const safeCurrency = String(currency || '').toUpperCase();
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || !/^[A-Z]{3}$/.test(safeCurrency)) {
    throw new Error('Capture amount or currency is invalid.');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const identity = await client.query(
      `SELECT po.id, po.mandate_id, po.status AS order_status, po.amount::text AS order_amount,
              po.currency AS order_currency, m.agent_run_id, m.status AS mandate_status
       FROM payment_orders po
       JOIN mandates m ON m.id = po.mandate_id
       WHERE po.id = $1
       FOR UPDATE OF po, m`,
      [paymentOrderId]
    );
    const row = identity.rows[0];
    if (!row || (mandateId && row.mandate_id !== mandateId) || (agentRunId && row.agent_run_id !== agentRunId)) {
      throw new Error('Capture does not match the stored AgentPay mandate.');
    }
    if (!['created', 'approved', 'captured'].includes(row.order_status) || !['active', 'used'].includes(row.mandate_status)) {
      throw new Error('Payment order or mandate is not in a capturable state.');
    }
    if (Math.round(Number(row.order_amount) * 100) !== amountCents || row.order_currency?.trim() !== safeCurrency) {
      throw new Error('Capture amount or currency differs from the approved payment order.');
    }

    const insert = await client.query(
      `INSERT INTO payment_captures (payment_order_id, paypal_capture_id, status, amount, currency, paypal_response)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [paymentOrderId, captureId, status, (amountCents / 100).toFixed(2), safeCurrency, JSON.stringify(response || {})]
    );
    let capture = insert.rows[0] || null;
    if (!capture) {
      const found = await client.query(
        `SELECT * FROM payment_captures
         WHERE payment_order_id = $1 OR paypal_capture_id = $2
         FOR UPDATE`,
        [paymentOrderId, captureId]
      );
      capture = found.rows[0] || null;
      const exactMatch = capture && Number(capture.payment_order_id) === Number(paymentOrderId)
        && capture.paypal_capture_id === captureId
        && capture.status === status
        && Math.round(Number(capture.amount) * 100) === amountCents
        && capture.currency?.trim() === safeCurrency;
      if (!exactMatch) throw new Error('A different PayPal capture is already recorded for this order or capture ID.');
    }

    await client.query(
      `UPDATE payment_orders SET status = 'captured', paypal_response = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [paymentOrderId, JSON.stringify(response || {})]
    );
    await client.query(`UPDATE mandates SET status = 'used' WHERE id = $1`, [row.mandate_id]);

    // Backfill missing evidence when recovering a capture that PayPal completed before a prior DB error.
    const proofEvent = await client.query(
      `SELECT 1 FROM agent_decisions
       WHERE mandate_id = $1 AND stage = 'Purchase Proof' AND metadata->>'paypalCaptureId' = $2
       LIMIT 1`,
      [row.mandate_id, captureId]
    );
    if (!proofEvent.rows[0]) {
      await appendDecisionEventsWithClient(client, {
        agentRunId: row.agent_run_id,
        mandateId: row.mandate_id,
        events: [
          { stage: 'Authorization', action: 'Buyer approval verified from the PayPal order and capture response.', result: 'APPROVED', metadata: { paypalOrderId: paypalOrderId || null } },
          { stage: 'PayPal', action: 'Verified and recorded the completed PayPal Sandbox capture.', result: 'COMPLETED', metadata: { paypalOrderId: paypalOrderId || null, paypalCaptureId: captureId, amount: amountCents / 100, currency: safeCurrency } },
          { stage: 'Purchase Proof', action: 'Recorded the verified PayPal capture in the hash-linked evidence chain.', result: 'RECORDED', metadata: { paypalOrderId: paypalOrderId || null, paypalCaptureId: captureId, amount: amountCents / 100, currency: safeCurrency } }
        ]
      });
    }

    await client.query('COMMIT');
    return { ...capture, payment_order_id: paymentOrderId, paypal_capture_id: captureId, status, amount: amountCents / 100, currency: safeCurrency, created: Boolean(insert.rows[0]) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPaymentCaptureByPayPalId(paypalCaptureId) {
  await ensureDatabase();
  const { rows } = await getPool().query(
    'SELECT * FROM payment_captures WHERE paypal_capture_id = $1 LIMIT 1',
    [paypalCaptureId]
  );
  return rows[0] || null;
}

export async function getPaymentCaptureByOrderId(paymentOrderId) {
  await ensureDatabase();
  const { rows } = await getPool().query(
    'SELECT * FROM payment_captures WHERE payment_order_id = $1 LIMIT 1',
    [paymentOrderId]
  );
  return rows[0] || null;
}

export async function getRecentLedger({ mandateId, limit = 100 }) {
  await ensureDatabase();
  const { rows } = await getPool().query(
    `SELECT id, stage, action, result, metadata, created_at, previous_event_hash, event_hash, event_payload
     FROM agent_decisions
     WHERE mandate_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [mandateId, Math.max(1, Math.min(500, Number(limit) || 100))]
  );
  return rows.reverse();
}

export async function getPurchaseProofRecords(mandateId) {
  await ensureDatabase();
  const db = getPool();
  const mandateResult = await db.query('SELECT * FROM mandates WHERE id = $1 LIMIT 1', [mandateId]);
  const mandate = mandateResult.rows[0] || null;
  if (!mandate) return null;
  const [runResult, orderResult, ledgerResult, auditHeadResult] = await Promise.all([
    mandate.agent_run_id ? db.query('SELECT result FROM agent_runs WHERE id = $1 LIMIT 1', [mandate.agent_run_id]) : Promise.resolve({ rows: [] }),
    db.query('SELECT * FROM payment_orders WHERE mandate_id = $1 ORDER BY id DESC LIMIT 1', [mandateId]),
    db.query(`SELECT id, stage, action, result, metadata, created_at, previous_event_hash, event_hash, event_payload
              FROM agent_decisions WHERE mandate_id = $1 ORDER BY created_at ASC, id ASC`, [mandateId]),
    db.query('SELECT head_hash, updated_at FROM audit_heads WHERE scope = $1 LIMIT 1', [mandateId])
  ]);
  const order = orderResult.rows[0] || null;
  let capture = null;
  let reconciliation = null;
  if (order) {
    const captureResult = await db.query('SELECT * FROM payment_captures WHERE payment_order_id = $1 LIMIT 1', [order.id]);
    capture = captureResult.rows[0] || null;
    if (capture?.paypal_capture_id) {
      const reconciliationResult = await db.query('SELECT * FROM workflow_reconciliations WHERE paypal_capture_id = $1 LIMIT 1', [capture.paypal_capture_id]);
      reconciliation = reconciliationResult.rows[0] || null;
    }
  }
  return { mandate, agentRun: runResult.rows[0]?.result || null, order, capture, reconciliation, events: ledgerResult.rows, auditHead: auditHeadResult.rows[0] || null };
}
