import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getPaymentOrderByPayPalId, getPaymentCaptureByPayPalId, recordWorkflowReconciliation } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const expected = process.env.WORKFLOW_SHARED_SECRET;
  const auth = request.headers.get('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expectedBuf = Buffer.from(expected || '', 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  const secretValid = Boolean(expected) && expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  if (!secretValid) return NextResponse.json({ error: 'Workflow authentication failed.' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'A valid JSON workflow payload is required.' }, { status: 400 }); }
  if (!body?.mandateId || !body?.paypalOrderId || !body?.paypalCaptureId || !body?.agentRunId) {
    return NextResponse.json({ error: 'agentRunId, mandateId, paypalOrderId and paypalCaptureId are required.' }, { status: 400 });
  }

  try {
    const payment = await getPaymentOrderByPayPalId(body.paypalOrderId);
    if (!payment || payment.mandate_id !== body.mandateId || payment.agent_run_id !== body.agentRunId || payment.status !== 'captured') {
      return NextResponse.json({ error: 'Workflow reconciliation identity could not be verified.' }, { status: 403 });
    }
    const capture = await getPaymentCaptureByPayPalId(body.paypalCaptureId);
    if (!capture || capture.status !== 'COMPLETED' || Number(capture.payment_order_id) !== Number(payment.id)) {
      return NextResponse.json({ error: 'Workflow capture could not be verified against the PayPal order.' }, { status: 403 });
    }
    const verifiedAmount = Number(capture.amount);
    const verifiedCurrency = String(capture.currency || '').trim();
    if (body.amount !== undefined && Math.round(Number(body.amount) * 100) !== Math.round(verifiedAmount * 100)) {
      return NextResponse.json({ error: 'Workflow amount does not match the stored PayPal capture.' }, { status: 403 });
    }
    if (body.currency !== undefined && String(body.currency).toUpperCase() !== verifiedCurrency) {
      return NextResponse.json({ error: 'Workflow currency does not match the stored PayPal capture.' }, { status: 403 });
    }
    const result = await recordWorkflowReconciliation({
      captureId: body.paypalCaptureId,
      paymentOrderId: payment.id,
      amount: verifiedAmount,
      currency: verifiedCurrency,
      workflowRunId: typeof body.workflowRunId === 'string' ? body.workflowRunId.slice(0, 180) : null,
      paypalOrderId: body.paypalOrderId
    });
    return NextResponse.json({ ok: true, reconciled: true, duplicate: !result.created, reconciliation: result.record }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Workflow reconciliation failed:', error?.message || error);
    return NextResponse.json({ error: 'Workflow reconciliation could not be completed.' }, { status: 500 });
  }
}
