'use client';

import { useEffect, useMemo, useState } from 'react';
import AgentLedger from './components/AgentLedger';
import PayPalPayButton from './components/PayPalPayButton';
import AgentStudio from './components/AgentStudio';
import PurchaseProofPanel from './components/PurchaseProofPanel';
import { apiUrl } from '../lib/api.js';

const DEMO_REQUEST = 'Buy 6 ergonomic office chairs for our new team. Stay under $1,500, arrive within 4 days, and prefer catalogue items carrying a recycled-material sample tag (not a certification).';

function money(v) { return `$${Number(v || 0).toFixed(2)}`; }

export default function Home() {
  const [request, setRequest] = useState(DEMO_REQUEST);
  const [plan, setPlan] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeDemo, setActiveDemo] = useState('mandate');
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [securityTest, setSecurityTest] = useState(null);
  const [securityRunning, setSecurityRunning] = useState(false);
  const [purchaseProof, setPurchaseProof] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('agentpay:lastPlan');
      if (!saved) return;
      const restored = JSON.parse(saved);
      if (restored?.mandate?.mandateId) {
        setPlan(restored);
        void refreshLedger(restored.mandate.mandateId);
        void refreshProof(restored.mandate.mandateId);
      }
    } catch {
      sessionStorage.removeItem('agentpay:lastPlan');
    }
  }, []);

  const offers = useMemo(() => (plan?.alternatives || []).map((p, index) => ({
    ...p,
    why: index === 0 ? 'Best deterministic fit across demo price, estimated delivery and request keywords.' : index === 1 ? 'Alternative with a different price and delivery trade-off.' : 'Other eligible demo-catalogue alternative.'
  })), [plan]);

  async function refreshLedger(mandateId) {
    if (!mandateId) return;
    try {
      const response = await fetch(apiUrl(`/api/ledger?mandateId=${encodeURIComponent(mandateId)}`), { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setEvents(data.events || []);
    } catch {
      // The payment flow remains usable even if the evidence panel is temporarily unavailable.
    }
  }

  async function refreshProof(mandateId) {
    if (!mandateId) return;
    setProofLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/proof?mandateId=${encodeURIComponent(mandateId)}`), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Purchase Proof.');
      const proof = data.proof || null;
      setPurchaseProof(proof);
      if (proof?.payment?.captureStatus === 'COMPLETED' && proof?.payment?.captureId) {
        setCaptured({
          id: proof.payment.orderId,
          captureId: proof.payment.captureId,
          status: proof.payment.captureStatus,
          amount: proof.payment.amount,
          currency: proof.payment.currency
        });
      }
    } catch (e) {
      setError((current) => current || e.message);
    } finally {
      setProofLoading(false);
    }
  }

  async function runAgent() {
    setRunning(true); setError(''); setCaptured(null); setPlan(null); setPurchaseProof(null); setEvents([]); setSecurityTest(null); sessionStorage.removeItem('agentpay:lastPlan');
    const started = Date.now();
    try {
      const response = await fetch(apiUrl('/api/agent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Agent failed');
      setPlan(data);
      sessionStorage.setItem('agentpay:lastPlan', JSON.stringify(data));
      setActiveDemo('mandate');
      await refreshLedger(data.mandate.mandateId);
      await refreshProof(data.mandate.mandateId);
    } catch (e) { setError(e.message); }
    finally { setRunning(false); void started; }
  }

  const status = !plan ? 'READY' : captured ? 'PAID IN SANDBOX' : plan.policy.status === 'PASS' ? 'POLICY PASSED' : 'BLOCKED';
  const selected = plan?.selectedItems?.[0];
  const agStudioReady = Boolean(plan?.sponsorIntegrations?.openaiConfigured && process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY);

  async function runSecurityTest() {
    if (!plan?.mandate?.mandateId || !selected) return;
    setSecurityRunning(true);
    setSecurityTest(null);
    setError('');
    const replacement = (plan.alternatives || []).find((item) => item.id !== selected.id && Number(item.stock || 0) >= Number(selected.quantity));
    const currentQuantity = Number(selected.quantity || 1);
    const quantityCeiling = Math.min(50, Number(selected.stock || 50));
    const changedQuantity = currentQuantity < quantityCeiling ? currentQuantity + 1 : Math.max(1, currentQuantity - 1);
    const attemptedItems = (plan.selectedItems || []).map((item, index) => ({
      id: index === 0 && replacement ? replacement.id : item.id,
      quantity: index === 0 && !replacement ? changedQuantity : Number(item.quantity)
    }));
    try {
      // Exercise the actual PayPal order-creation boundary with a modified cart.
      // The signed mandate remains unchanged; the server must reject this before calling PayPal.
      const response = await fetch(apiUrl('/api/paypal/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandate: plan.mandate, items: attemptedItems })
      });
      const data = await response.json().catch(() => ({}));
      setSecurityTest({
        blocked: response.status === 403 && data.paypalOrderCreated === false,
        status: response.status,
        attemptedQuantity: attemptedItems[0]?.quantity,
        attemptedProductId: attemptedItems[0]?.id,
        attemptedTotal: attemptedItems.reduce((sum, item) => {
          const original = (plan.selectedItems || []).find((line) => line.id === item.id)
            || (plan.alternatives || []).find((line) => line.id === item.id);
          const unitPrice = Number(original?.price || 0);
          return sum + unitPrice * item.quantity;
        }, 0),
        paypalOrderCreated: data.paypalOrderCreated,
        message: data.error || 'Request completed.'
      });
      await refreshLedger(plan.mandate.mandateId);
      await refreshProof(plan.mandate.mandateId);
    } catch (e) { setError(e.message); }
    finally { setSecurityRunning(false); }
  }

  return (
    <main>
      <header className="topbar">
        <div className="logo-wrap"><div className="logo-mark">A</div><div><div className="brand">AgentPay</div><div className="brand-sub">trust layer for AI commerce</div></div></div>
        <div className="top-actions"><span className="status-live"><i /> WORKING PROTOTYPE</span><span className="sandbox">PAYPAL SANDBOX</span></div>
      </header>

      <section className="hero shell">
        <div>
          <div className="kicker">AGENTIC COMMERCE · TRUSTED EXECUTION</div>
          <h1>Let AI <span>act with money</span> — without giving it unlimited authority.</h1>
          <p className="hero-copy">AgentPay converts a plain-English purchase request into a bounded, cryptographically signed mandate. The agent can discover and decide; policy constrains the cart; PayPal remains the final buyer-authorization boundary.</p>
          <div className="proof-row"><span>✓ AI tool calling</span><span>✓ Signed mandate</span><span>✓ Policy firewall</span><span>✓ PayPal order + capture</span></div>
        </div>
        <div className="hero-visual">
          <div className="orb orb-a" /><div className="orb orb-b" />
          <div className="mandate-card">
            <div className="mc-top"><span className="secure-dot" /> {plan ? 'MANDATE SIGNED' : 'MANDATE READY'} <b>{plan?.mandate?.fingerprint || 'AWAITING RUN'}</b></div>
            <div className="mc-value"><div><small>MAX SPEND</small><strong>{plan?.mandate?.maxTotal ? money(plan.mandate.maxTotal) : '—'}</strong></div><div><small>EXPIRY</small><strong>24h</strong></div></div>
            <div className="mc-rule"><span>ALLOWED</span><b>{plan?.mandate?.allowedCategories?.join(' · ') || '—'}</b></div>
            <div className="mc-rule"><span>DELIVERY</span><b>{plan?.mandate?.maxDeliveryDays ? `≤ ${plan.mandate.maxDeliveryDays} days` : '—'}</b></div>
            <div className="mc-rule"><span>PAYMENT</span><b>PayPal buyer approval</b></div>
          </div>
        </div>
      </section>

      <section className="shell workspace">
        <div className="surface intent-panel">
          <div className="panel-head"><div><div className="step">01</div><div><span className="kicker">BUYER INTENT</span><h2>Set the goal. AgentPay sets the boundary.</h2></div></div><span className="state-pill">{status}</span></div>
          <textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Example: Buy 4 monitors under $1,200 and deliver within 3 days." />
          <div className="intent-actions"><div className="scenario-row"><button className={activeDemo === 'mandate' ? 'scenario active' : 'scenario'} onClick={() => { setActiveDemo('mandate'); setRequest(DEMO_REQUEST); }}>Office restock</button><button className={activeDemo === 'risk' ? 'scenario active' : 'scenario'} onClick={() => { setActiveDemo('risk'); setRequest('Buy 10 premium 4K monitors under $2,000 and have them arrive in 2 days.'); }}>Stress test</button></div><button className="run" onClick={runAgent} disabled={!request.trim() || running}>{running ? 'Agent is working…' : 'Run Agent →'}</button></div>
          {error && <div className="inline-error">{error}</div>}
          <div className="human-rule"><div className="lock">⌾</div><div><b>Human-in-the-loop by default</b><span>AgentPay can prepare the transaction, but the final PayPal approval remains with the buyer.</span></div></div>
        </div>

        <div className="surface result-panel">
          <div className="panel-head"><div><div className="step">02</div><div><span className="kicker">AGENT DECISION</span><h2>From intent → mandate → cart</h2></div></div><span className="verified-pill">{plan ? (plan.agentMode === 'openai-tools' ? 'AI · OPENAI' : 'FALLBACK') : 'WAITING'}</span></div>
          {!plan ? <div className="blank"><div className="blank-icon">✦</div><h3>Give the agent a real constraint.</h3><p>It will search the approved demo catalogue, generate a signed mandate and explain its deterministic constraints. Live market observations are shown separately when Channel3 is configured.</p></div> : <>
            <div className="decision-banner"><div><span className="kicker">{selected ? 'RECOMMENDED CART' : 'NO AUTHORIZED CART'}</span><h3>{selected ? `${selected.quantity} × ${selected.name}` : 'No compliant purchase authorized'}</h3><p>{plan.rationale}</p>{plan.channel3Warning && <p className="fallback-note">Channel3 was unavailable; the approved execution catalog remained the safety allowlist.</p>}{plan.agentMode !== 'openai-tools' && <p className="fallback-note">AI was unavailable, so the deterministic safety fallback was used. Configure OPENAI_API_KEY for the primary AI path.</p>}</div><div className="decision-total"><small>TOTAL</small><strong>{money(plan.total)}</strong><span>{plan.policy.utilization}% of mandate</span></div></div>
            <div className="trace-row">{plan.trace.map((t, i) => <div key={t.step} className={t.status === 'blocked' ? 'trace-item blocked' : 'trace-item'}><span>{String(i+1).padStart(2, '0')}</span><b>{t.step}</b><small>{t.status}</small></div>)}</div>
            <div className="two-cards">
              <div className="mini-card"><div className="mini-title">Why this cart?</div><p>{plan.whyNotCheapest}</p><div className="signal-grid"><span><b>{selected ? money(selected.price) : '—'}</b><small>fixture unit price</small></span><span><b>{selected ? `${selected.shippingDays}d` : '—'}</b><small>fixture delivery estimate</small></span><span><b>{selected ? selected.category : '—'}</b><small>category</small></span><span><b>{plan.policy.budgetUtilizationPct}</b><small>budget utilization %</small></span></div></div>
              <div className="mini-card mandate-box"><div className="mini-title">Signed intent mandate</div><div className="mandate-line"><span>Fingerprint</span><b>{plan.mandate.fingerprint}</b></div><div className="mandate-line"><span>Cart commitment</span><b>{plan.mandate.cartCommitment}</b></div><div className="mandate-line"><span>Ceiling</span><b>{money(plan.mandate.maxTotal)}</b></div><div className="mandate-line"><span>Expires</span><b>24 hours</b></div><div className="signature">Ed25519 · cryptographically verified</div></div>
            </div>
            <div className="security-panel">
              <div><span className="kicker">ADVERSARIAL CHECK</span><strong>Prove the firewall, don't just describe it.</strong><p>Send an altered cart to the real PayPal order-creation endpoint. The server must reject the changed cart commitment and confirm that no PayPal order was created.</p></div>
              <button className="secondary-action" onClick={runSecurityTest} disabled={securityRunning || Boolean(captured)}>{securityRunning ? 'Testing boundary…' : 'Simulate tampering →'}</button>
              {securityTest && <div className={securityTest.blocked ? 'security-result' : 'security-result security-failed'}><b>{securityTest.blocked ? 'BLOCKED BEFORE PAYPAL' : 'BLOCK NOT VERIFIED'}</b><span>HTTP {securityTest.status} · attempted SKU {securityTest.attemptedProductId} · quantity {securityTest.attemptedQuantity} · {money(securityTest.attemptedTotal)}</span><span>{securityTest.message}</span></div>}
            </div>
          </>}
        </div>
      </section>

      {plan && <section className="shell checkout-row">
        <div className="surface approval-card"><div className="step">03</div><div className="approval-copy"><span className="kicker">CONTROLLED PAYMENT</span><h2>{plan.policy.status === 'PASS' ? 'Mandate passed. PayPal still asks the buyer.' : 'Payment blocked by policy.'}</h2><p>{plan.policy.status === 'PASS' ? 'This is the key trust boundary: the agent cannot silently move money. Approve the transaction inside PayPal Sandbox.' : plan.policy.violations.join(' ')}</p><div className="policy-chips"><span>Policy: {plan.policy.status}</span><span>Budget utilization: {plan.policy.budgetUtilizationPct}%</span><span>Spend: {plan.policy.utilization}%</span></div></div></div>
        <div className="surface paypal-card">{!captured && <PayPalPayButton plan={plan} onOrderCreated={async () => { await refreshLedger(plan.mandate.mandateId); await refreshProof(plan.mandate.mandateId); }} onCaptured={async (result) => { setCaptured(result); await refreshLedger(plan.mandate.mandateId); await refreshProof(plan.mandate.mandateId); }} />}{captured && <div className="capture-success"><div className="success-icon">✓</div><div><b>PayPal capture complete</b><span>Capture ID: {captured.captureId || captured.purchase_units?.[0]?.payments?.captures?.[0]?.id || 'Unavailable'}</span>{captured.agentPayWorkflow?.queued && <span className="workflow-note">Render Workflow queued · {captured.agentPayWorkflow.taskRunId || 'run accepted'}</span>}</div></div>}</div>
      </section>}

      {plan && <section className="shell sponsor-stack"><div className="surface sponsor-ribbon"><div><span className="kicker">SPONSOR STACK</span><strong>One workflow, multiple meaningful integrations.</strong></div><div className="sponsor-statuses"><span className={plan.sponsorIntegrations?.channel3 ? 'sponsor-live' : 'sponsor-off'}>Channel3 {plan.sponsorIntegrations?.channel3 ? 'LIVE' : 'optional'}</span><span className={agStudioReady ? 'sponsor-live' : 'sponsor-off'}>AG Studio {agStudioReady ? 'AI CONFIGURED' : 'not configured'}</span><span className={plan.sponsorIntegrations?.paypalMcp ? 'sponsor-live' : 'sponsor-off'}>PayPal MCP {plan.sponsorIntegrations?.paypalMcp ? 'USED' : 'optional / not used'}</span><span className={plan.sponsorIntegrations?.renderWorkflows ? 'sponsor-live' : 'sponsor-off'}>Render {plan.sponsorIntegrations?.renderWorkflows ? 'CONFIGURED' : 'optional'}</span></div></div><AgentStudio offers={offers} events={events} plan={plan} channel3Offers={plan?.channel3Offers || []} proof={purchaseProof} /></section>}

      {plan && <section className="shell proof-receipt-section"><PurchaseProofPanel proof={purchaseProof} loading={proofLoading} onRefresh={() => refreshProof(plan.mandate.mandateId)} /></section>}

      <section className="shell ledger-section"><AgentLedger offers={offers} events={events} channel3Offers={plan?.channel3Offers || []} /></section>

      {plan?.channel3Summary && (
        <section className="shell market-proof">
          <div className="surface market-card">
            <span className="kicker">CHANNEL3 · TIMESTAMPED MARKET OBSERVATIONS</span>
            <h2>Timestamped external retail observations.</h2>
            <div className="market-metrics">
              <span><b>{plan.channel3Summary.count}</b><small>external observations</small></span>
              <span><b>{plan.channel3Summary.pricedOfferCount ?? 0}</b><small>priced observations in {plan.channel3Summary.currency || 'one currency'}</small></span>
              <span><b>{plan.channel3Summary.currency || '—'} {plan.channel3Summary.lowestPrice == null ? '—' : Number(plan.channel3Summary.lowestPrice).toFixed(2)}</b><small>lowest observed price in this snapshot</small></span>
              <span><b>{selected?.merchant || 'approved catalog'}</b><small>execution source</small></span>
            </div>
            <p>{plan.channel3Summary.note || 'Timestamped Channel3 observations are not live quotes, verified like-for-like benchmarks, or checkout authority.'} AgentPay only sends an approved demo-catalogue cart to PayPal after server-side mandate verification.</p>
          </div>
        </section>
      )}

      <section className="shell proof-grid">
        <div className="surface proof-card"><span className="kicker">WHY IT MATTERS</span><h2>Autonomy needs a spending boundary.</h2><p>As AI moves from recommending to acting, the missing product layer is not another chatbot. It is a way to encode what the user meant, enforce it before payment, and preserve evidence after execution.</p></div>
        <div className="surface proof-card"><span className="kicker">PAYPAL IS CENTRAL</span><h2>Not a decorative checkout button.</h2><p>AgentPay creates an order server-side through PayPal Orders v2, hands the buyer to PayPal for authorization, then captures the Sandbox order and surfaces the resulting transaction identifier.</p></div>
        <div className="surface proof-card"><span className="kicker">HACKATHON FIT</span><h2>Built for the five judge dimensions.</h2><div className="dimension-list"><span>Technology <b>AI + PayPal + evidence</b></span><span>Design <b>complete workflow</b></span><span>Impact <b>trust for real purchases</b></span><span>Innovation <b>mandate-first commerce</b></span><span>Presentation <b>visible end-to-end demo</b></span></div></div>
      </section>

      <footer className="shell"><span>AgentPay · PayPal AI Hackathon 2026</span><span>OpenAI · PayPal Sandbox · PostgreSQL · AG Grid · AG Studio · Channel3 · Render Workflows</span></footer>
    </main>
  );
}
