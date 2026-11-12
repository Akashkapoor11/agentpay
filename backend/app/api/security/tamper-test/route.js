import { NextResponse } from 'next/server';
import { getProduct } from '../../../../lib/catalog.js';
import { verifyMandate } from '../../../../lib/mandate.js';
import { getMandateById, addDecisionEvents } from '../../../../lib/db.js';
import { cartCommitment } from '../../../../lib/cart.js';

export const runtime = 'nodejs';

/**
 * POST /api/security/tamper-test
 *
 * Explicit adversarial probe endpoint.  Accepts a mandate + a modified cart
 * and returns a structured result that shows whether the commitment firewall
 * correctly blocked the tampered cart.  No PayPal order is ever created by
 * this route.
 *
 * The UI's "Simulate tampering" button uses the existing
 * /api/paypal/create-order endpoint directly (which also fires the block and
 * logs it to the audit chain).  This dedicated route is provided for Postman
 * and judge exploration so the security boundary can be tested in isolation.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const clientMandate = body?.mandate;
    const requestedItems = Array.isArray(body?.items) ? body.items : [];

    if (!clientMandate?.mandateId) {
      return NextResponse.json({ error: 'mandateId is required.' }, { status: 400 });
    }
    if (!requestedItems.length) {
      return NextResponse.json({ error: 'Provide at least one item to test.' }, { status: 400 });
    }

    const stored = await getMandateById(clientMandate.mandateId);
    if (!stored) {
      return NextResponse.json({ error: 'Mandate not found.' }, { status: 404 });
    }

    // Mandate signature and expiry check (same logic as create-order).
    const signatureValid = verifyMandate(stored.mandate);

    // Resolve each requested item against the approved catalogue.
    const resolvedItems = [];
    for (const item of requestedItems) {
      const id = String(item?.id || item?.productId || '');
      const product = getProduct(id);
      const quantity = Number(item?.quantity);
      if (product && Number.isInteger(quantity) && quantity >= 1 && quantity <= 50) {
        resolvedItems.push({ ...product, quantity });
      } else {
        resolvedItems.push({ id, quantity: quantity || 0, unknown: true });
      }
    }

    const attemptedCommitment = cartCommitment(
      resolvedItems
        .filter((i) => !i.unknown)
        .map((i) => ({ id: i.id, quantity: i.quantity, price: i.price, currency: 'USD' }))
    );
    const expectedCommitment = stored.mandate?.cartCommitment || '';
    const commitmentMatches = attemptedCommitment === expectedCommitment;

    const blocked = !commitmentMatches || !signatureValid || stored.status !== 'active';

    if (!commitmentMatches && stored.agent_run_id) {
      await addDecisionEvents({
        agentRunId: stored.agent_run_id,
        mandateId: stored.id,
        events: [{
          stage: 'Security',
          action: 'Adversarial tamper-test probe: cart commitment did not match the signed mandate.',
          result: 'PROBE_BLOCKED',
          metadata: {
            attemptedCommitment,
            expectedCommitment,
            paypalOrderCreated: false,
            source: 'tamper-test-route'
          }
        }]
      }).catch(() => {});
    }

    return NextResponse.json({
      blocked,
      paypalOrderCreated: false,
      commitmentMatches,
      signatureValid,
      mandateStatus: stored.status,
      expectedCommitment,
      attemptedCommitment,
      resolvedItems: resolvedItems.map((i) => ({ id: i.id, quantity: i.quantity, unknown: Boolean(i.unknown) })),
      message: blocked
        ? 'Cart commitment does not match the signed mandate. No PayPal order was created.'
        : 'Cart matches the signed mandate (this is not an order-creation endpoint; no PayPal order was created).'
    }, { status: blocked ? 403 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Tamper-test probe failed:', error?.message || error);
    return NextResponse.json({ error: 'Tamper-test probe failed.' }, { status: 500 });
  }
}

