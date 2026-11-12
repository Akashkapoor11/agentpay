'use client';

function pretty(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function PurchaseProofPanel({ proof, loading = false, onRefresh }) {
  if (!proof && !loading) return null;
  const payment = proof?.payment || {};
  const integrity = proof?.audit?.integrity || {};

  function downloadProof() {
    if (!proof || typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${proof.purchaseId || 'agentpay-purchase-proof'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="surface purchase-proof">
      <div className="proof-panel-head">
        <div>
          <span className="kicker">PURCHASE PROOF · TRANSACTION EVIDENCE</span>
          <h2>One receipt. Full authorization-to-capture trail.</h2>
          <p>Values are loaded from AgentPay's persisted PostgreSQL records and PayPal Sandbox response.</p>
        </div>
        <div className="proof-actions">
          <button className="secondary-action" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh proof'}</button>
          <button className="run" onClick={downloadProof} disabled={!proof}>Download JSON</button>
        </div>
      </div>
      {!proof ? <div className="proof-pending">Purchase proof will appear when the mandate is persisted.</div> : <>
        <div className="proof-state-row">
          <span className={payment.captureStatus === 'COMPLETED' ? 'proof-state success' : 'proof-state'}>{payment.captureStatus || 'NOT_CAPTURED'}</span>
          <span className={integrity.status === 'VERIFIED' ? 'proof-state success' : integrity.status === 'FAILED' ? 'proof-state danger' : 'proof-state'}>Audit: {integrity.status || 'NOT_CHECKED'}</span>
          <span className="proof-id">{pretty(proof.purchaseId)}</span>
        </div>
        <div className="proof-fields">
          <div><small>Mandate fingerprint</small><b>{pretty(proof.authorization?.fingerprint)}</b></div>
          <div><small>Cart commitment</small><b>{pretty(proof.authorization?.cartCommitment)}</b></div>
          <div><small>PayPal order ID</small><b>{pretty(payment.orderId)}</b></div>
          <div><small>PayPal capture ID</small><b>{pretty(payment.captureId)}</b></div>
          <div><small>{payment.captureStatus === 'COMPLETED' ? 'Captured amount' : 'Order amount'}</small><b>{payment.amount == null ? '—' : `${payment.currency || ''} ${Number(payment.amount).toFixed(2)}`}</b></div>
          <div><small>Reconciliation</small><b>{pretty(proof.reconciliation?.status || 'See audit events')}</b></div>
        </div>
        <div className="proof-footnote">
          <span>{Number(integrity.verifiedEvents || 0)} verified hash-linked events</span>
          <span>{Number(integrity.legacyEvents || 0)} legacy un-hashed events</span>
          {integrity.error && <strong>{integrity.error}</strong>}
        </div>
      </>}
    </section>
  );
}
