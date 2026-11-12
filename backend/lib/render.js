export async function triggerReconciliationWorkflow(payload) {
  if (!process.env.RENDER_API_KEY || !process.env.RENDER_WORKFLOW_TASK_SLUG || !process.env.AGENTPAY_PUBLIC_URL || !process.env.WORKFLOW_SHARED_SECRET) {
    return { configured: false, queued: false, taskRunId: null };
  }
  if (!payload?.paypalCaptureId) return { configured: true, queued: false, taskRunId: null, error: 'A PayPal capture ID is required for idempotent reconciliation.' };
  try {
    const { Render } = await import('@renderinc/sdk');
    const render = new Render({ token: process.env.RENDER_API_KEY });
    const started = await render.workflows.startTask(
      process.env.RENDER_WORKFLOW_TASK_SLUG,
      [{ ...payload, appUrl: process.env.AGENTPAY_PUBLIC_URL }],
      { idempotencyKey: `agentpay-reconcile-${payload.paypalCaptureId}` }
    );
    return { configured: true, queued: true, taskRunId: started?.taskRunId || null, idempotencyKey: `agentpay-reconcile-${payload.paypalCaptureId}` };
  } catch (error) {
    return { configured: true, queued: false, taskRunId: null, error: error?.message || 'Render workflow trigger failed.' };
  }
}
