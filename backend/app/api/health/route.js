import { NextResponse } from 'next/server';
import { ensureDatabase } from '../../../lib/db.js';
import { mandatePublicKeyConfigured } from '../../../lib/mandate.js';

export const runtime = 'nodejs';

export async function GET() {
  const checks = { database: false, paypalSandbox: (process.env.PAYPAL_ENV || 'sandbox') === 'sandbox', paypalCredentials: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), aiConfigured: Boolean(process.env.OPENAI_API_KEY), channel3Configured: Boolean(process.env.CHANNEL3_API_KEY), paypalMcpEnabled: process.env.PAYPAL_MCP_ENABLED === 'true', mandateSigningReady: process.env.NODE_ENV !== 'production' || mandatePublicKeyConfigured(), renderWorkflowConfigured: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_WORKFLOW_TASK_SLUG && process.env.AGENTPAY_PUBLIC_URL && process.env.WORKFLOW_SHARED_SECRET) };
  try {
    await ensureDatabase();
    checks.database = true;
  } catch {
    // Keep health response explicit without exposing connection details.
  }
  const ready = checks.database && checks.paypalSandbox && checks.paypalCredentials && checks.aiConfigured && checks.mandateSigningReady;
  return NextResponse.json({ status: ready ? 'ok' : 'degraded', checks }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
