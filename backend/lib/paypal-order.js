import { fromCents, toCents } from './cart.js';

/** Build a PayPal Orders v2 CAPTURE request from server-validated catalogue items. */
export function buildPayPalOrderPayload({ fingerprint, title, paymentRecordId, items, currency = 'USD' }) {
  const safeCurrency = String(currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(safeCurrency)) throw new Error('A three-letter payment currency is required.');
  if (!/^[a-f0-9]{32,128}$/i.test(String(fingerprint || ''))) throw new Error('A valid mandate fingerprint is required.');
  if (!Number.isSafeInteger(Number(paymentRecordId)) || Number(paymentRecordId) < 1) throw new Error('A valid payment record ID is required.');
  if (!Array.isArray(items) || !items.length) throw new Error('At least one approved cart item is required.');

  const totalCents = items.reduce((sum, item) => {
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new Error('Cart quantities must be integers between 1 and 50.');
    return sum + toCents(item?.price) * quantity;
  }, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents < 1) throw new Error('The PayPal order total is invalid.');

  const total = fromCents(totalCents).toFixed(2);
  const referenceId = `AGENTPAY-${fingerprint}`;
  const invoiceId = `AP-${fingerprint}-${paymentRecordId}`;
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: referenceId,
      invoice_id: invoiceId,
      description: `AgentPay approved: ${String(title || 'purchase')}`.slice(0, 127),
      custom_id: String(fingerprint),
      amount: {
        currency_code: safeCurrency,
        value: total,
        // PayPal requires item_total when purchase_units[].items[].unit_amount is sent.
        breakdown: { item_total: { currency_code: safeCurrency, value: total } }
      },
      items: items.map((item) => ({
        name: String(item.name || item.id).slice(0, 127),
        sku: String(item.id),
        category: 'PHYSICAL_GOODS',
        quantity: String(item.quantity),
        unit_amount: { currency_code: safeCurrency, value: fromCents(toCents(item.price)).toFixed(2) }
      }))
    }]
  };
  return { payload, totalCents, total: fromCents(totalCents) };
}
