import { createHash } from 'node:crypto';

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function verifyAuditChain(events, scope, storedHead = null) {
  const genesis = createHash('sha256').update(`AGENTPAY-AUDIT-GENESIS:${scope || 'GLOBAL'}`).digest('hex');
  let previousHash = genesis;
  let verified = 0;
  let legacy = 0;
  let error = null;
  for (const event of events || []) {
    if (!event.event_hash || !event.event_payload || !event.previous_event_hash) {
      legacy += 1;
      continue;
    }
    if (event.previous_event_hash !== previousHash) {
      error = `Chain link mismatch at event ${event.id}.`;
      break;
    }
    const expected = createHash('sha256').update(`${previousHash}.${stableJson(event.event_payload)}`).digest('hex');
    if (expected !== event.event_hash) {
      error = `Event hash mismatch at event ${event.id}.`;
      break;
    }
    const payload = event.event_payload;
    const eventMetadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
    if (payload.agentRunId !== (event.agent_run_id || null) || payload.mandateId !== (event.mandate_id || null) || payload.stage !== event.stage || payload.action !== event.action || payload.result !== event.result || stableJson(payload.metadata || {}) !== stableJson(eventMetadata || {})) {
      error = `Event payload mismatch at event ${event.id}.`;
      break;
    }
    if (event.created_at && Math.abs(new Date(payload.createdAt).getTime() - new Date(event.created_at).getTime()) > 1) {
      error = `Event timestamp mismatch at event ${event.id}.`;
      break;
    }
    previousHash = event.event_hash;
    verified += 1;
  }
  if (!error && storedHead?.head_hash && verified > 0 && storedHead.head_hash !== previousHash) {
    error = 'Stored audit head does not match the last verified event.';
  }
  if (!error && storedHead?.head_hash && verified === 0 && !legacy) {
    error = 'An audit head exists without verifiable events.';
  }
  return { status: error ? 'FAILED' : legacy ? 'VERIFIED_WITH_LEGACY_EVENTS' : 'VERIFIED', verifiedEvents: verified, legacyEvents: legacy, lastVerifiedHash: verified ? previousHash : null, storedHeadHash: storedHead?.head_hash || null, error };
}
