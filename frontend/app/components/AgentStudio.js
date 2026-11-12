'use client';

import { useMemo, useState } from 'react';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { AgStudioAiModule, createAiHarness } from 'ag-studio';
import { createAgentPayStudioAdapter } from './agentpayStudioAdapter.js';

// Suppress AG Studio trial license console errors in development to prevent Next.js error overlay
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args) => {
    const msg = args.map(a => (typeof a === 'string' ? a : (a?.message || JSON.stringify(a) || ''))).join(' ');
    if (
      msg.includes('AG Studio') ||
      msg.includes('License Key Not Found') ||
      msg.includes('has no fields') ||
      msg.includes('licenseKey') ||
      msg.includes('ag-grid')
    ) {
      return;
    }
    origError.apply(console, args);
  };
}

const PROMPT_STARTERS = [
  { label: 'Summarise procurement', prompt: 'Summarise the current AgentPay procurement plan, its constraints and the evidence available.' },
  { label: 'Review blocked events', prompt: 'Analyse the audit ledger and explain every blocked policy or security event.' },
  { label: 'Compare market observations', prompt: 'Compare Channel3 observations by currency and availability. Do not compare unlike currencies or infer missing prices.' },
  { label: 'Review payment proof', prompt: 'Explain the payment and evidence status shown in the available data. Do not claim a payment was captured unless the data contains a capture ID and completed status.' }
];

export default function AgentStudio({ offers = [], events = [], plan = null, channel3Offers = [], proof = null }) {
  const [mode, setMode] = useState('view');
  const selectedId = plan?.selectedItems?.[0]?.id || null;
  const adapter = useMemo(() => createAgentPayStudioAdapter(), []);
  const ai = useMemo(() => ({ api }) => createAiHarness(api, { adapter, promptStarters: PROMPT_STARTERS }), [adapter]);

  const rows = useMemo(() => offers.map((offer, i) => ({
    offer: offer.name,
    productId: offer.id,
    category: offer.category,
    merchant: offer.merchant,
    unitPrice: Number(offer.price || 0),
    deliveryEstimateDays: Number(offer.shippingDays || 0),
    catalogueTags: Array.isArray(offer.tags) ? offer.tags.join(', ') : '',
    constraintFit: Number(offer.fitScore ?? (100 - i * 4)),
    dataClass: offer.fixtureSource || 'UNCLASSIFIED',
    selected: offer.id === selectedId
  })), [offers, selectedId]);

  const evidence = useMemo(() => events.map((event) => ({
    eventId: String(event.id || ''),
    time: event.created_at ? new Date(event.created_at).toISOString() : event.time || '',
    stage: event.stage,
    result: event.result,
    action: event.action,
    eventHash: event.event_hash || event.eventHash || ''
  })), [events]);

  const market = useMemo(() => channel3Offers.map((offer) => ({
    product: offer.name,
    productId: offer.productId || offer.externalId || '',
    offerId: offer.offerId || '',
    merchant: offer.merchant,
    price: offer.price !== null && offer.price !== undefined && Number.isFinite(Number(offer.price)) ? Number(offer.price) : null,
    currency: offer.currency || 'UNKNOWN',
    availability: offer.availabilityStatus || 'UNKNOWN',
    observedAt: offer.retrievedAt || '',
    evidenceType: 'Timestamped observation (not a live quote)',
    source: offer.source || 'Channel3'
  })), [channel3Offers]);

  const payment = useMemo(() => [{
    mandateCeiling: Number(plan?.mandate?.maxTotal || 0),
    proposedSpend: Number(plan?.total || 0),
    utilizationPct: Number(plan?.policy?.utilization || 0),
    budgetUtilizationPct: Number(plan?.policy?.budgetUtilizationPct || 0),
    policyStatus: plan?.policy?.status || 'WAITING',
    agentMode: plan?.agentMode || 'waiting',
    paypalOrderId: proof?.payment?.orderId || '',
    paypalCaptureId: proof?.payment?.captureId || '',
    captureStatus: proof?.payment?.captureStatus || 'NOT_CAPTURED',
    auditIntegrity: proof?.audit?.integrity?.status || 'NOT_CHECKED'
  }], [plan, proof]);

  const data = useMemo(() => {
    const sources = [
      { id: 'approved_demo_catalogue', data: rows },
      { id: 'purchase_controls', data: payment }
    ];
    if (Array.isArray(evidence) && evidence.length > 0 && evidence.some(e => e.eventId || e.stage)) {
      sources.push({ id: 'decision_ledger', data: evidence });
    }
    if (Array.isArray(market) && market.length > 0 && market.some(m => m.product)) {
      sources.push({ id: 'channel3_market_observations', data: market });
    }
    return { sources };
  }, [rows, evidence, payment, market]);

  if (!plan) return null;
  const aiConfigured = Boolean(plan?.sponsorIntegrations?.openaiConfigured && process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY);

  return (
    <section className="surface studio-panel">
      <div className="studio-head">
        <div>
          <span className="kicker">AG STUDIO · AI ANALYTICS COMMAND CENTER</span>
          <h2>Explore the evidence in natural language.</h2>
          <p>AG Studio's built-in agent framework is connected to a server-side OpenAI adapter. The analytics assistant is read-only: it cannot approve or execute payments.</p>
        </div>
        <div className="studio-actions">
          <span className={aiConfigured ? 'sponsor-badge' : 'sponsor-off'}>{aiConfigured ? 'AI + AG Studio configured' : 'AI / AG Studio setup incomplete'}</span>
          <button onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}>{mode === 'view' ? 'Customize dashboard' : 'Lock view'}</button>
        </div>
      </div>
      <div className="studio-canvas">
        <AgStudioProvider modules={[AgStudioAiModule]} licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY || undefined}>
          <AgStudio data={data} mode={mode} ai={aiConfigured ? ai : undefined} />
        </AgStudioProvider>
      </div>
      <p className="studio-disclaimer">Demo-catalogue rows are synthetic fixtures. Channel3 rows are external observations and are not automatically equivalent or independently verified market benchmarks.</p>
    </section>
  );
}
