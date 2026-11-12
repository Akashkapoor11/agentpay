import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { runAgent } from '../../../lib/agent.js';
import { createAgentRun, createMandateRecord, addDecisionEvents } from '../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const text = String(body?.request || '').trim();
    if (!text) return NextResponse.json({ error: 'Describe what you want the agent to buy.' }, { status: 400 });
    if (text.length > 1000) return NextResponse.json({ error: 'Keep the purchase request under 1,000 characters.' }, { status: 413 });

    const agentRunId = randomUUID();
    const result = await runAgent({ request: text, agentRunId });
    result.sponsorIntegrations = {
      channel3: Boolean(process.env.CHANNEL3_API_KEY) && Boolean(result.channel3Offers?.length),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      paypalMcp: Boolean(result.paypalMcpUsed),
      renderWorkflows: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_WORKFLOW_TASK_SLUG && process.env.AGENTPAY_PUBLIC_URL && process.env.WORKFLOW_SHARED_SECRET),
      apimaticContextPlugin: process.env.APIMATIC_CONTEXT_USED === 'true'
    };

    await createAgentRun({ id: agentRunId, request: text, agentMode: result.agentMode, result });
    await createMandateRecord({ id: result.mandate.mandateId, agentRunId, mandate: result.mandate, status: result.policy.status === 'PASS' ? 'active' : 'blocked' });
    const traceEvents = result.trace.map((t) => ({
      stage: t.step,
      action: t.detail,
      result: t.status,
      metadata: { agentMode: result.agentMode, sponsorIntegrations: result.sponsorIntegrations }
    }));
    if (result.channel3Offers?.length) {
      traceEvents.push({
        stage: 'Channel3',
        action: 'Enriched the agent decision with live normalized retail market offers.',
        result: 'USED',
        metadata: { count: result.channel3Offers.length, summary: result.channel3Summary }
      });
    }
    await addDecisionEvents({ agentRunId, mandateId: result.mandate.mandateId, events: traceEvents });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Agent execution failed:', error?.message || error);
    return NextResponse.json({ error: 'Agent execution failed. Check the backend logs for diagnostics.' }, { status: 502 });
  }
}
