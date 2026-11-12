import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getProduct } from '../../../../lib/catalog.js';
import { verifyMandate } from '../../../../lib/mandate.js';
import { evaluateMandate } from '../../../../lib/policy.js';
import { paypalRequest } from '../../../../lib/paypal.js';
import { cartCommitment, toCents, fromCents } from '../../../../lib/cart.js';
import { buildPayPalOrderPayload } from '../../../../lib/paypal-order.js';
import {
  getMandateById,
  createPaymentOrderRecord,
  setPaymentOrderCreated,
  setPaymentOrderFailed,
  addDecisionEvents,
  markMandateStatus
} from '../../../../lib/db.js';

export const runtime = 'nodejs';

function approvalUrl(order) {
  const links = Array.isArray(order?.links) ? order.links : [];
  const link = links.find((entry) => entry?.rel === 'approve' || entry?.rel === 'payer-action');
  if (typeof link?.href !== 'string') return null;
  try {
    const url = new URL(link.href);
    return url.protocol === 'https:' && (url.hostname === 'paypal.com' || url.hostname.endsWith('.paypal.com'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function sameIdentity(clientMandate, storedMandate) {
  return Boolean(
    clientMandate?.mandateId &&
    clientMandate.mandateId === storedMandate?.mandateId &&
    clientMandate.fingerprint === storedMandate?.fingerprint &&
    clientMandate.signature === storedMandate?.signature
  );
}

export async function POST(request) {
  let paymentRecord;
  try {
    const body = await request.json();
    const clientMandate = body?.mandate;
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    if (!clientMandate?.mandateId) return NextResponse.json({ error: 'mandateId is required.' }, { status: 400 });
    if (!requestedItems.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });

    const stored = await getMandateById(clientMandate.mandateId);
    if (!stored || !sameIdentity(clientMandate, stored.mandate) || !verifyMandate(stored.mandate)) {
      return NextResponse.json({ error: 'Mandate verification failed. The signed mandate is missing, changed, or expired.' }, { status: 403 });
    }
    if (stored.status !== 'active') {
      return NextResponse.json({ error: `Mandate is ${stored.status}.` }, { status: 403 });
    }

    const safeItems = [];
    for (const requestedItem of requestedItems) {
      const id = String(requestedItem?.id || requestedItem?.productId || '');
      const product = getProduct(id);
      if (!product) return NextResponse.json({ error: 'The cart contains a product outside the approved checkout catalogue.', blocked: true, paypalOrderCreated: false }, { status: 403 });
      const quantity = Number(requestedItem?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return NextResponse.json({ error: `Invalid quantity for ${product.name}.`, blocked: true, paypalOrderCreated: false }, { status: 400 });
      if (quantity > product.stock) return NextResponse.json({ error: `${product.name} exceeds the demo catalogue stock limit.`, blocked: true, paypalOrderCreated: false }, { status: 409 });
      safeItems.push({ ...product, quantity });
    }

    if (cartCommitment(safeItems) !== stored.mandate.cartCommitment) {
      await addDecisionEvents({
        agentRunId: stored.agent_run_id,
        mandateId: stored.id,
        events: [{
          stage: 'Security',
          action: 'Rejected a checkout request whose cart differed from the signed purchase commitment.',
          result: 'BLOCKED_TAMPER_ATTEMPT',
          metadata: {
            attemptedItems: safeItems.map((item) => ({ id: item.id, quantity: item.quantity })),
            expectedCartCommitment: stored.mandate.cartCommitment,
            attemptedCartCommitment: cartCommitment(safeItems),
            paypalOrderCreated: false
          }
        }]
      });
      return NextResponse.json({ error: 'Cart does not match the signed mandate commitment. No PayPal order was created.', blocked: true, paypalOrderCreated: false }, { status: 403 });
    }

    const totalCents = safeItems.reduce((sum, item) => sum + toCents(item.price) * item.quantity, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents < 1) throw new Error('Invalid payment total.');
    const total = fromCents(totalCents);
    const policy = evaluateMandate({ mandate: stored.mandate, items: safeItems, total });
    if (policy.status !== 'PASS') {
      await markMandateStatus(stored.id, 'blocked');
      await addDecisionEvents({
        agentRunId: stored.agent_run_id,
        mandateId: stored.id,
        events: [{ stage: 'Policy', action: 'Re-validated cart before PayPal order creation', result: 'BLOCK', metadata: { violations: policy.violations } }]
      });
      return NextResponse.json({ error: `Payment blocked by mandate: ${policy.violations.join(' ')}` }, { status: 403 });
    }

    const currency = 'USD';
    const requestId = `ap-${createHash('sha256').update(`${stored.fingerprint}:${stored.id}`).digest('hex').slice(0, 32)}`;
    paymentRecord = await createPaymentOrderRecord({
      mandateId: stored.id,
      requestId,
      amount: total,
      currency,
      cart: safeItems,
      policy
    });

    if (paymentRecord.paypal_order_id && paymentRecord.status !== 'failed') {
      return NextResponse.json({
        id: paymentRecord.paypal_order_id,
        status: paymentRecord.status,
        total: Number(paymentRecord.amount),
        approveUrl: approvalUrl(paymentRecord.paypal_response),
        policy,
        mandateFingerprint: stored.fingerprint
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const orderRequest = buildPayPalOrderPayload({
      fingerprint: stored.fingerprint,
      title: stored.title,
      paymentRecordId: paymentRecord.id,
      items: safeItems,
      currency
    });
    if (orderRequest.totalCents !== totalCents) throw new Error('PayPal order builder total differs from the policy-approved total.');
    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': requestId },
      body: JSON.stringify(orderRequest.payload)
    });

    if (!order?.id) throw new Error('PayPal did not return an order ID.');
    await setPaymentOrderCreated({ id: paymentRecord.id, paypalOrderId: order.id, response: order });
    await addDecisionEvents({
      agentRunId: stored.agent_run_id,
      mandateId: stored.id,
      events: [{ stage: 'PayPal', action: 'Created sandbox order from verified mandate and cart commitment', result: order.status || 'CREATED', metadata: { paypalOrderId: order.id, amount: total } }]
    });

    return NextResponse.json({
      id: order.id,
      status: order.status,
      total,
      approveUrl: approvalUrl(order),
      policy,
      mandateFingerprint: stored.fingerprint
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('PayPal order creation failed:', error?.message || error);
    if (paymentRecord?.id) {
      await setPaymentOrderFailed(paymentRecord.id, { message: 'PayPal order creation failed; inspect server logs for provider diagnostics.' }).catch(() => {});
    }
    return NextResponse.json({ error: 'Could not create the PayPal Sandbox order. Check the server logs and retry safely.' }, { status: 502 });
  }
}
