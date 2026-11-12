'use client';

import { PayPalOneTimePaymentButton, PayPalProvider } from '@paypal/react-paypal-js/sdk-v6';
import { useState } from 'react';
import { apiUrl } from '../../lib/api.js';

export default function PayPalPayButton({ plan, onCaptured, onOrderCreated }) {
  const [error, setError] = useState('');
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!plan?.mandate || plan.policy?.status !== 'PASS') return null;
  if (!clientId) {
    return <div className="config-warning"><b>PayPal is ready to connect.</b><span>Add NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable Sandbox checkout.</span></div>;
  }

  return (
    <PayPalProvider clientId={clientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
      <div className="paypal-zone">
        <div className="paypal-zone-head"><div><span className="mini-label">FINAL AUTHORIZATION</span><strong>PayPal buyer approval</strong></div><span className="secure-chip">SANDBOX</span></div>
        <PayPalOneTimePaymentButton
          presentationMode="auto"
          createOrder={async () => {
            setError('');
            const response = await fetch(apiUrl('/api/paypal/create-order'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mandate: plan.mandate, items: plan.selectedItems })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'PayPal order creation failed');
            onOrderCreated?.(data);
            return { orderId: data.id };
          }}
          onApprove={async ({ orderId }) => {
            try {
              setError('');
              const response = await fetch(apiUrl('/api/paypal/capture-order'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderID: orderId })
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'PayPal capture failed');
              onCaptured?.(result);
            } catch (e) {
              setError(e.message);
              throw e;
            }
          }}
          onCancel={() => setError('Payment was cancelled before capture. No funds were captured.')}
          onError={(e) => setError(e?.message || 'PayPal checkout error')}
        />
        {error ? <div className="pay-error">{error}</div> : <p className="paypal-note">The signed mandate constrains the cart before PayPal creates the order. PayPal remains the buyer authorization boundary.</p>}
      </div>
    </PayPalProvider>
  );
}
