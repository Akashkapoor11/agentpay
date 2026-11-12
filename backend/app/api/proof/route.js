import { NextResponse } from 'next/server';
import { getPurchaseProofRecords } from '../../../lib/db.js';
import { verifyAuditChain } from '../../../lib/audit.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const mandateId = request.nextUrl.searchParams.get('mandateId');
    if (!mandateId) return NextResponse.json({ error: 'mandateId is required.' }, { status: 400 });
    const records = await getPurchaseProofRecords(mandateId);
    if (!records) return NextResponse.json({ error: 'Purchase mandate was not found.' }, { status: 404 });

    const { mandate, agentRun, order, capture, reconciliation, events, auditHead } = records;
    const marketEvidence = Array.isArray(agentRun?.channel3Offers) ? agentRun.channel3Offers.map((offer) => ({
      externalId: offer.externalId,
      productId: offer.productId || offer.externalId || null,
      offerId: offer.offerId || null,
      name: offer.name,
      merchant: offer.merchant,
      price: offer.price,
      currency: offer.currency,
      availabilityStatus: offer.availabilityStatus || 'UNKNOWN',
      retrievedAt: offer.retrievedAt,
      source: offer.source
    })) : [];
    const auditIntegrity = verifyAuditChain(events, mandateId, auditHead);
    const reconciliationEvent = [...events].reverse().find((event) => event.stage === 'Render Workflow');
    const captureId = capture?.paypal_capture_id || capture?.paypal_response?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
    const proof = {
      schemaVersion: '1.0',
      product: 'AgentPay',
      purchaseId: `AP-${String(order?.id || mandate.id)}`,
      generatedAt: new Date().toISOString(),
      buyerIntent: {
        digest: mandate.mandate?.intentDigest || null,
        title: mandate.title,
        mandateId: mandate.id
      },
      authorization: {
        algorithm: mandate.mandate?.algorithm || null,
        fingerprint: mandate.fingerprint,
        cartCommitment: mandate.mandate?.cartCommitment || null,
        maxTotal: mandate.mandate?.maxTotal ?? null,
        maxDeliveryDays: mandate.mandate?.maxDeliveryDays ?? null,
        expiresAt: mandate.expires_at,
        status: mandate.status
      },
      marketEvidence,
      policy: order?.policy || agentRun?.policy || null,
      cart: order?.cart || agentRun?.selectedItems || [],
      payment: {
        provider: 'PayPal Sandbox',
        orderId: order?.paypal_order_id || null,
        orderStatus: order?.status || 'NOT_CREATED',
        captureId,
        captureStatus: capture?.status || 'NOT_CAPTURED',
        amount: capture?.amount ?? order?.amount ?? null,
        currency: capture?.currency || order?.currency || null,
        capturedAt: capture?.captured_at || null
      },
      reconciliation: {
        status: reconciliation?.status || reconciliationEvent?.result || 'NOT_QUEUED',
        action: reconciliationEvent?.action || null,
        workflowRunId: reconciliation?.workflow_run_id || null,
        reconciledAt: reconciliation?.reconciled_at || null,
        metadata: reconciliationEvent?.metadata || null
      },
      audit: {
        integrity: auditIntegrity,
        eventCount: events.length,
        lastEventHash: events.filter((event) => event.event_hash).at(-1)?.event_hash || null,
        events: events.map((event) => ({
          id: String(event.id), stage: event.stage, action: event.action, result: event.result,
          metadata: event.metadata, createdAt: event.created_at,
          previousEventHash: event.previous_event_hash, eventHash: event.event_hash
        }))
      }
    };
    return NextResponse.json({ proof }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Purchase proof request failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not build the Purchase Proof record.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
