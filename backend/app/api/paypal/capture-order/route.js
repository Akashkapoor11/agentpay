import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getProduct } from '../../../../lib/catalog.js';
import { evaluateMandate } from '../../../../lib/policy.js';
import { verifyMandate } from '../../../../lib/mandate.js';
import { paypalRequest } from '../../../../lib/paypal.js';
import { cartCommitment, toCents, fromCents } from '../../../../lib/cart.js';
import { getPaymentOrderByPayPalId, getPaymentCaptureByOrderId, addDecisionEvents, markOrderApproved, recordCapture, markMandateStatus } from '../../../../lib/db.js';
import { triggerReconciliationWorkflow } from '../../../../lib/render.js';

export const runtime = 'nodejs';

function normalizedAmount(order) {
  const pu = order?.purchase_units?.[0];
  return Number(pu?.amount?.value || 0);
}

function samePayPalItems(orderItems, storedCart) {
  const normalize = (items) => items.map((i) => ({
    sku: String(i?.sku || ''),
    quantity: Number(i?.quantity || 0),
    unitAmountCents: toCents(i?.unit_amount?.value || 0),
    currency: String(i?.unit_amount?.currency_code || '')
  })).sort((a, b) => a.sku.localeCompare(b.sku));
  const actual = normalize(Array.isArray(orderItems) ? orderItems : []);
  const expected = normalize(Array.isArray(storedCart) ? storedCart.map((i) => ({
    sku: i.id,
    quantity: i.quantity,
    unit_amount: { value: fromCents(toCents(i.price)).toFixed(2), currency_code: 'USD' }
  })) : []);
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function POST(request) {
  try {
    const { orderID } = await request.json();
    if (!orderID) return NextResponse.json({ error: 'orderID is required.' }, { status: 400 });

    const payment = await getPaymentOrderByPayPalId(orderID);
    if (!payment) return NextResponse.json({ error: 'PayPal order is not registered with AgentPay.' }, { status: 403 });
    if (!['created', 'approved', 'captured'].includes(payment.status)) {
      return NextResponse.json({ error: `Order is in ${payment.status} state.` }, { status: 409 });
    }
    if (payment.status === 'captured') {
      const storedCapture = await getPaymentCaptureByOrderId(payment.id);
      if (storedCapture?.status === 'COMPLETED') {
        await recordCapture({ paymentOrderId: payment.id, captureId: storedCapture.paypal_capture_id, status: storedCapture.status, amount: Number(storedCapture.amount), currency: storedCapture.currency, response: storedCapture.paypal_response || {}, mandateId: payment.mandate_id, agentRunId: payment.agent_run_id, paypalOrderId: orderID });
        const workflow = await triggerReconciliationWorkflow({
          appUrl: process.env.AGENTPAY_PUBLIC_URL || '', mandateId: payment.mandate_id, agentRunId: payment.agent_run_id,
          paypalOrderId: orderID, paypalCaptureId: storedCapture.paypal_capture_id, amount: Number(storedCapture.amount)
        });
        return NextResponse.json({ status: 'COMPLETED', id: orderID, captureId: storedCapture.paypal_capture_id, agentPayWorkflow: workflow }, { headers: { 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json({ error: 'Payment is marked captured but its capture record is missing. Manual reconciliation is required.' }, { status: 409 });
    }
    if (!verifyMandate(payment.mandate)) return NextResponse.json({ error: 'Stored mandate is not valid or has expired.' }, { status: 403 });
    if (payment.mandate_status !== 'active') return NextResponse.json({ error: `Mandate is ${payment.mandate_status}; capture is not authorized.` }, { status: 403 });

    const freshOrder = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderID)}`, { method: 'GET' });
    if (!['APPROVED', 'COMPLETED'].includes(freshOrder?.status)) {
      return NextResponse.json({ error: `PayPal order is ${freshOrder?.status || 'not approved'}.` }, { status: 409 });
    }
    if (freshOrder?.id !== orderID || freshOrder?.intent !== 'CAPTURE') {
      return NextResponse.json({ error: 'PayPal order identity or intent is unexpected.' }, { status: 403 });
    }
    const units = Array.isArray(freshOrder.purchase_units) ? freshOrder.purchase_units : [];
    if (units.length !== 1) return NextResponse.json({ error: 'Unexpected PayPal order shape.' }, { status: 409 });
    const unit = units[0];
    if (unit?.custom_id !== payment.fingerprint || unit?.reference_id !== `AGENTPAY-${payment.fingerprint}`) {
      return NextResponse.json({ error: 'PayPal order identity does not match the stored mandate.' }, { status: 403 });
    }
    if (String(unit?.amount?.currency_code || '') !== payment.currency || toCents(normalizedAmount(freshOrder)) !== toCents(payment.amount)) {
      return NextResponse.json({ error: 'PayPal order amount does not match the policy-approved amount.' }, { status: 403 });
    }
    if (cartCommitment(payment.cart) !== payment.mandate.cartCommitment) {
      return NextResponse.json({ error: 'Stored cart no longer matches the signed mandate commitment.' }, { status: 403 });
    }
    if (cartCommitment(Array.isArray(unit?.items) ? unit.items.map((i) => ({ id: i.sku, quantity: i.quantity, price: i?.unit_amount?.value })) : []) !== payment.mandate.cartCommitment) {
      return NextResponse.json({ error: 'PayPal order cart commitment does not match the signed mandate.' }, { status: 403 });
    }
    if (!samePayPalItems(unit?.items, payment.cart)) {
      return NextResponse.json({ error: 'PayPal order items do not match the policy-approved cart.' }, { status: 403 });
    }

    const items = Array.isArray(payment.cart) ? payment.cart.map((i) => {
      const p = getProduct(i.id);
      return p ? { ...p, quantity: Number(i.quantity) } : null;
    }) : [];
    if (!items.length || items.some((i) => !i || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > i.stock)) {
      return NextResponse.json({ error: 'Stored cart is no longer valid.' }, { status: 409 });
    }
    const totalCents = items.reduce((sum, item) => sum + toCents(item.price) * item.quantity, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents < 1) return NextResponse.json({ error: 'Stored cart has an invalid payment total.' }, { status: 409 });
    const total = fromCents(totalCents);
    const policy = evaluateMandate({ mandate: payment.mandate, items, total });
    if (policy.status !== 'PASS' || toCents(total) !== toCents(payment.amount)) {
      await markMandateStatus(payment.mandate_id, 'blocked');
      return NextResponse.json({ error: `Capture blocked by policy: ${policy.violations.join(' ') || 'cart changed'}` }, { status: 403 });
    }

    if (freshOrder.status === 'COMPLETED') {
      const capture = freshOrder?.purchase_units?.[0]?.payments?.captures?.[0];
      if (capture?.status !== 'COMPLETED' || toCents(capture?.amount?.value || 0) !== toCents(total) || capture?.amount?.currency_code !== payment.currency) {
        return NextResponse.json({ error: 'PayPal reports a completed order with an unexpected capture.' }, { status: 409 });
      }
      await recordCapture({
        paymentOrderId: payment.id,
        captureId: capture.id,
        status: capture.status,
        amount: Number(capture.amount.value),
        currency: capture.amount.currency_code,
        response: freshOrder,
        mandateId: payment.mandate_id,
        agentRunId: payment.agent_run_id,
        paypalOrderId: orderID
      });
      const workflow = await triggerReconciliationWorkflow({
        appUrl: process.env.AGENTPAY_PUBLIC_URL || '',
        mandateId: payment.mandate_id, agentRunId: payment.agent_run_id, paypalOrderId: orderID, paypalCaptureId: capture.id, amount: total
      });
      return NextResponse.json({ id: orderID, status: 'COMPLETED', captureId: capture.id, amount: total, currency: payment.currency, agentPayWorkflow: workflow }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await markOrderApproved(payment.id);
    const result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `apcap-${createHash('sha256').update(String(orderID)).digest('hex').slice(0, 32)}` }
    });

    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture?.status !== 'COMPLETED') throw new Error('PayPal capture did not complete.');
    if (toCents(capture?.amount?.value || 0) !== toCents(total) || capture?.amount?.currency_code !== payment.currency) {
      throw new Error('Captured amount does not match the approved cart.');
    }

    await recordCapture({
      paymentOrderId: payment.id,
      captureId: capture.id,
      status: capture.status,
      amount: Number(capture.amount.value),
      currency: capture.amount.currency_code,
      response: result,
      mandateId: payment.mandate_id,
      agentRunId: payment.agent_run_id,
      paypalOrderId: orderID
    });
    const workflow = await triggerReconciliationWorkflow({
      appUrl: process.env.AGENTPAY_PUBLIC_URL || '',
      mandateId: payment.mandate_id, agentRunId: payment.agent_run_id, paypalOrderId: orderID, paypalCaptureId: capture.id, amount: total
    });
    await addDecisionEvents({
      agentRunId: payment.agent_run_id,
      mandateId: payment.mandate_id,
      events: [{ stage: 'Render Workflow', action: workflow.queued ? 'Queued durable post-payment reconciliation.' : 'Render Workflow is not configured; reconciliation remains available locally.', result: workflow.queued ? 'QUEUED' : 'SKIPPED', metadata: workflow }]
    });

    return NextResponse.json({ id: orderID, status: 'COMPLETED', captureId: capture.id, amount: total, currency: payment.currency, agentPayWorkflow: workflow }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('PayPal capture failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not capture the approved PayPal Sandbox order. Check the server logs before retrying.' }, { status: 502 });
  }
}
