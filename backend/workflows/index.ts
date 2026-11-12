import { task, type TaskContext } from '@renderinc/sdk/workflows';

const reconcilePayment = task(
  {
    name: 'reconcile-payment',
    retry: { maxRetries: 3, waitDurationMs: 1500, backoffScaling: 2 },
    timeoutSeconds: 120,
    plan: 'flex'
  },
  async (_ctx: TaskContext, payload: { appUrl: string; mandateId: string; agentRunId: string; paypalOrderId: string; paypalCaptureId: string; amount: number }) => {
    const response = await fetch(`${payload.appUrl}/api/workflow/reconcile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.WORKFLOW_SHARED_SECRET || ''}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`AgentPay reconciliation returned ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
);

void reconcilePayment;
