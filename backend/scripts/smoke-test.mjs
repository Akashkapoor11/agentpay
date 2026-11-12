import assert from 'node:assert/strict';
import { createMandate, verifyMandate } from '../lib/mandate.js';
import { evaluateMandate } from '../lib/policy.js';
import { searchProducts } from '../lib/catalog.js';
import { cartCommitment, toCents, fromCents } from '../lib/cart.js';
import { channel3Search, normalizeOffer, extractChannel3Products, normalizeSearchResults } from '../lib/channel3.js';
import { verifyAuditChain } from '../lib/audit.js';
import { createHash } from 'node:crypto';
import { buildPayPalOrderPayload } from '../lib/paypal-order.js';
import { parseConstraints } from '../lib/constraints.js';

const parsedBuyerRequest = parseConstraints('Buy 6 ergonomic office chairs for our team under $1,500 and deliver within 4 days.');
assert.equal(parsedBuyerRequest.quantity, 6);
assert.equal(parsedBuyerRequest.budget, 1500);
assert.equal(parsedBuyerRequest.maxDays, 4);
assert.equal(Number((parsedBuyerRequest.budget / parsedBuyerRequest.quantity).toFixed(2)), 250, 'Channel3 max-price context must use a per-unit budget when quantity is explicit.');
const wordNumberRequest = parseConstraints('Buy six ergonomic office chairs under $1,500 and deliver within four business days.');
assert.equal(wordNumberRequest.quantity, 6, 'Common written-out quantities must be extracted.');
assert.equal(wordNumberRequest.maxDays, 4, 'Common written-out delivery windows must be extracted.');
assert.equal(wordNumberRequest.query, 'chair');

const mandate = createMandate({
  subject: 'agentic-commerce-purchase',
  intentDigest: 'f'.repeat(64),
  title: 'Smoke test mandate',
  maxTotal: 500,
  maxDeliveryDays: 4,
  allowedCategories: ['office'],
  allowedMerchants: [],
  preferredAttributes: ['recycled-material-demo-tag'],
  approvalMode: 'payPal-buyer-approval',
  expiresAt: new Date(Date.now() + 3600000).toISOString()
});
assert.equal(verifyMandate(mandate), true);
assert.ok(mandate.fingerprint.length === 32);
assert.equal(mandate.intentDigest.length, 64);
const offers = searchProducts('chair', { maxDeliveryDays: 4 }, 5);
assert.ok(offers.length >= 2);
const unitBudgetOffers = searchProducts('chair', { maxUnitPrice: 200, maxDeliveryDays: 4 }, 8);
assert.ok(unitBudgetOffers.length > 0 && unitBudgetOffers.every((item) => item.price <= 200), 'Approved catalogue discovery should filter against the per-unit budget.');
const signedCart = [{ id: offers[0].id, quantity: 1, price: offers[0].price, currency: 'USD' }];
const signedCartHash = cartCommitment(signedCart);
assert.equal(signedCartHash.length, 64);
assert.equal(cartCommitment([...signedCart].reverse()), signedCartHash);
assert.notEqual(cartCommitment([{ ...signedCart[0], quantity: 2 }]), signedCartHash);
assert.notEqual(cartCommitment([{ ...signedCart[0], price: signedCart[0].price + 0.01 }]), signedCartHash);
assert.notEqual(cartCommitment([{ ...signedCart[0], currency: 'EUR' }]), signedCartHash);
assert.throws(() => cartCommitment([{ id: 'bad', quantity: 1, price: 0 }]));
assert.equal(toCents(1.005), 101);
assert.equal(`ap-${createHash('sha256').update('fingerprint:mandate').digest('hex').slice(0, 32)}`.length, 35);
assert.equal(`apcap-${createHash('sha256').update('ORDER-ID').digest('hex').slice(0, 32)}`.length, 38);
assert.equal(fromCents(1234), 12.34);
const paypalPayload = buildPayPalOrderPayload({
  fingerprint: 'a'.repeat(64), title: 'Office purchase', paymentRecordId: 7,
  items: [{ id: 'chair-1', name: 'Chair', quantity: 2, price: 125.50 }, { id: 'monitor-1', name: 'Monitor', quantity: 1, price: 249.99 }]
});
const paypalUnit = paypalPayload.payload.purchase_units[0];
assert.equal(paypalPayload.totalCents, 50099);
assert.equal(paypalUnit.amount.value, '500.99');
assert.deepEqual(paypalUnit.amount.breakdown.item_total, { currency_code: 'USD', value: '500.99' });
assert.equal(paypalUnit.items.reduce((sum, item) => sum + toCents(item.unit_amount.value) * Number(item.quantity), 0), paypalPayload.totalCents);
assert.equal(paypalPayload.payload.intent, 'CAPTURE');
assert.throws(() => buildPayPalOrderPayload({ fingerprint: 'bad', title: 'x', paymentRecordId: 1, items: [] }));
const policy = evaluateMandate({ mandate, items: [{ ...offers[0], quantity: 1 }], total: offers[0].price });
assert.equal(policy.status, 'PASS');
assert.equal(Object.hasOwn(policy, 'riskScore'), false, 'Policy must not claim a predictive fraud score.');
assert.ok(Number.isFinite(policy.budgetUtilizationPct));
assert.equal(policy.budgetUtilizationPct, policy.utilization);
const mismatchedTotal = evaluateMandate({ mandate, items: [{ ...offers[0], quantity: 1 }], total: offers[0].price + 0.01 });
assert.equal(mismatchedTotal.status, 'BLOCK', 'Policy must recompute the cart total rather than trust a caller-supplied total.');
const wrongCurrency = evaluateMandate({ mandate: { ...mandate, currency: 'USD' }, items: [{ ...offers[0], quantity: 1, currency: 'EUR' }], total: offers[0].price });
assert.equal(wrongCurrency.status, 'BLOCK', 'Policy must reject items priced in a different currency.');
const invalidPrice = evaluateMandate({ mandate, items: [{ ...offers[0], quantity: 1, price: -1 }], total: -1 });
assert.equal(invalidPrice.status, 'BLOCK', 'Policy must reject negative prices.');
const blocked = evaluateMandate({ mandate, items: [{ ...offers[0], quantity: 3 }], total: offers[0].price * 3 });
assert.equal(blocked.status, 'BLOCK');

const tampered = { ...mandate, maxTotal: mandate.maxTotal + 1 };
assert.equal(verifyMandate(tampered), false);
const expired = { ...mandate, expiresAt: new Date(Date.now() - 1000).toISOString() };
assert.equal(verifyMandate(expired), false);
const noBudget = createMandate({
  subject: 'agentic-commerce-purchase', intentDigest: 'e'.repeat(64), title: 'No budget', maxTotal: 0, maxDeliveryDays: 4,
  allowedCategories: ['office'], allowedMerchants: [], preferredAttributes: [], approvalMode: 'payPal-buyer-approval',
  cartCommitment: cartCommitment([{ id: offers[0].id, quantity: 1, price: offers[0].price }]),
  expiresAt: new Date(Date.now() + 3600000).toISOString()
});
assert.equal(evaluateMandate({ mandate: noBudget, items: [{ ...offers[0], quantity: 1 }], total: offers[0].price }).status, 'BLOCK');
const unknownAvailability = normalizeOffer({ product: { id: 'ext-1', title: 'External test item' }, offer: { price: 20, currency: 'USD' } });
assert.equal(unknownAvailability.availabilityStatus, 'UNKNOWN');
assert.equal(unknownAvailability.available, null, 'Unknown stock must not be converted to available.');
assert.equal(unknownAvailability.price, 20);
const channel3DocumentedProduct = {
  id: 'channel3-product-1',
  title: 'Ergonomic chair',
  description: 'External market observation',
  image_url: 'https://images.example.test/chair.png',
  offers: [
    { id: 'offer-1', domain: 'retailer-one.example', price: { price: '129.95', currency: 'USD' }, url: 'https://retailer-one.example/chair' },
    { id: 'offer-2', domain: 'retailer-two.example', price: { amount: 134.50, currency_code: 'USD' }, url: 'https://retailer-two.example/chair', availability: 'in_stock' }
  ]
};
assert.deepEqual(extractChannel3Products({ data: [channel3DocumentedProduct] }), [channel3DocumentedProduct]);
const channel3Normalized = normalizeSearchResults({ data: [channel3DocumentedProduct] });
assert.equal(channel3Normalized.length, 2, 'Each merchant offer must become a separate Channel3 observation.');
assert.equal(channel3Normalized[0].price, 129.95, 'Nested Channel3 price.price must be normalized.');
assert.equal(channel3Normalized[0].currency, 'USD');
assert.equal(channel3Normalized[0].merchant, 'retailer-one.example');
assert.equal(channel3Normalized[0].availabilityStatus, 'UNKNOWN', 'Missing Channel3 stock must remain unknown.');
assert.equal(channel3Normalized[0].productId, 'channel3-product-1');
assert.equal(channel3Normalized[0].offerId, 'offer-1');
assert.equal(channel3Normalized[1].price, 134.5, 'Nested Channel3 price.amount must be normalized.');
assert.equal(channel3Normalized[1].availabilityStatus, 'IN_STOCK');
assert.equal(channel3Normalized[1].available, true);
assert.ok(!Object.hasOwn(channel3Normalized[0], 'url'), 'Short-lived Channel3 affiliate URLs must not be persisted or served later.');
assert.ok(!Object.hasOwn(channel3Normalized[0], 'imageUrl'), 'Unneeded ephemeral Channel3 presentation URLs must not be persisted.');
assert.equal(channel3Normalized[0].retrievedAt, channel3Normalized[1].retrievedAt, 'All offers from one response must share a retrieval timestamp.');
assert.equal(normalizeSearchResults({ results: [channel3DocumentedProduct] }).length, 2, 'Compatibility response envelopes should remain supported.');
const originalFetch = globalThis.fetch;
const originalChannel3Key = process.env.CHANNEL3_API_KEY;
let channel3RequestCaptured = null;
try {
  process.env.CHANNEL3_API_KEY = 'test-channel3-key';
  globalThis.fetch = async (url, options) => {
    channel3RequestCaptured = { url: String(url), options };
    return new Response(JSON.stringify({ data: [channel3DocumentedProduct] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const liveAdapterShape = await channel3Search('ergonomic chair', { maxPrice: 250, limit: 6, userId: 'agentpay-test-user' });
  assert.equal(liveAdapterShape.configured, true);
  assert.equal(liveAdapterShape.offers.length, 2, 'Channel3 adapter must parse the documented Page.data shape.');
  assert.equal(channel3RequestCaptured.url, 'https://api.trychannel3.com/v1/search');
  assert.equal(channel3RequestCaptured.options.headers['x-api-key'], 'test-channel3-key');
  assert.equal(channel3RequestCaptured.options.headers['x-user-id'], 'agentpay-test-user');
  const channel3Body = JSON.parse(channel3RequestCaptured.options.body);
  assert.equal(channel3Body.filters.price.max_price, 250, 'Channel3 must receive the per-unit max-price filter.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalChannel3Key === undefined) delete process.env.CHANNEL3_API_KEY;
  else process.env.CHANNEL3_API_KEY = originalChannel3Key;
}

const scope = 'smoke-scope';
const genesis = createHash('sha256').update(`AGENTPAY-AUDIT-GENESIS:${scope}`).digest('hex');
const payload = { agentRunId: null, mandateId: scope, stage: 'Test', action: 'Smoke event', result: 'OK', metadata: {}, createdAt: new Date().toISOString() };
const stable = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const eventHash = createHash('sha256').update(`${genesis}.${stable(payload)}`).digest('hex');
const verified = verifyAuditChain([{ id: 1, agent_run_id: null, mandate_id: scope, stage: payload.stage, action: payload.action, result: payload.result, previous_event_hash: genesis, event_hash: eventHash, event_payload: payload }], scope, { head_hash: eventHash });
assert.equal(verified.status, 'VERIFIED');
const tamperedEvent = { id: 1, agent_run_id: null, mandate_id: scope, stage: payload.stage, action: 'Edited action', result: payload.result, previous_event_hash: genesis, event_hash: eventHash, event_payload: payload };
assert.equal(verifyAuditChain([tamperedEvent], scope, { head_hash: eventHash }).status, 'FAILED');
const metadataTamper = { ...({ id: 1, agent_run_id: null, mandate_id: scope, stage: payload.stage, action: payload.action, result: payload.result, metadata: { edited: true }, previous_event_hash: genesis, event_hash: eventHash, event_payload: payload }) };
assert.equal(verifyAuditChain([metadataTamper], scope, { head_hash: eventHash }).status, 'FAILED');
console.log('smoke test passed');


// Static guardrail checks for the required API-first behavior.
const agentSource = await (await import('node:fs/promises')).readFile(new URL('../lib/agent.js', import.meta.url), 'utf8');
const fallbackHits = [...agentSource.matchAll(/\bdeterministic\s*\(/g)].map((m) => m.index);
assert.equal(fallbackHits.length, 2, 'deterministic fallback should have one definition and one invocation.');
const catchIndex = agentSource.lastIndexOf('} catch (error) {');
assert.ok(catchIndex > -1, 'AI failure catch block missing.');
assert.ok(agentSource.indexOf('return deterministic(input, error?.message ||') > catchIndex, 'Fallback must be invoked from the AI failure catch path.');
assert.ok(agentSource.indexOf('await client.responses.create') < catchIndex, 'OpenAI must be attempted before fallback.');
const createOrderSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/paypal/create-order/route.js', import.meta.url), 'utf8');
assert.ok(createOrderSource.includes("entry?.rel === 'approve' || entry?.rel === 'payer-action'"), 'PayPal order response must expose its buyer approval link when provided.');
assert.ok(createOrderSource.includes("url.hostname.endsWith('.paypal.com')"), 'Approval links must be HTTPS PayPal URLs only.');
assert.ok(createOrderSource.includes('paypalOrderCreated: false'), 'Pre-payment rejections must explicitly state that no PayPal order was created.');
const dbSource = await (await import('node:fs/promises')).readFile(new URL('../lib/db.js', import.meta.url), 'utf8');
assert.ok(/WHERE request_id = \$1[\s\S]*?\[requestId\]/.test(dbSource), 'Request lookup must bind requestId as parameter $1.');
const captureSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/paypal/capture-order/route.js', import.meta.url), 'utf8');
assert.ok(captureSource.includes("freshOrder?.status"), 'Capture must re-fetch the order from PayPal before capture.');
assert.ok(captureSource.includes('cartCommitment(payment.cart)'), 'Capture must verify the persisted signed cart commitment.');
const searchCallIndex = agentSource.indexOf('await channel3Search(');
const localCatalogIndex = agentSource.indexOf('const approvedOffers = searchProducts(');
assert.ok(searchCallIndex > -1 && localCatalogIndex > searchCallIndex, 'Channel3 API must be attempted before local catalog fallback when configured.');
assert.ok(agentSource.includes('budget / Math.max(1, buyerConstraints.quantity)'), 'Channel3 price filtering must use the explicit per-unit budget.');
assert.ok(agentSource.indexOf('const buyerConstraints = parseConstraints(input.request);') < agentSource.indexOf('if (process.env.CHANNEL3_API_KEY)'), 'Buyer constraints must be available even when Channel3 is not configured.');
assert.ok(agentSource.includes('maxUnitPrice }, 8'), 'Approved catalogue search must also use the per-unit budget.');
assert.ok(!agentSource.includes("Math.max(3, input.alternatives?.length || 5)"), 'Offer discovery trace must report actual offer counts.');
assert.ok(!agentSource.includes('merchantTrust'), 'Agent scoring must not rely on fabricated merchant-trust values.');
assert.ok(!/sustainability\s*:/i.test(agentSource), 'Agent scoring must not emit fabricated sustainability fields.');
const mainAgentSource = await (await import('node:fs/promises')).readFile(new URL('../lib/agent.js', import.meta.url), 'utf8');
const analyticsAgentSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/analytics/agent/route.js', import.meta.url), 'utf8');
assert.ok(mainAgentSource.includes("process.env.OPENAI_MODEL || 'gpt-6-astra'"), 'Main agent must default to the selected current Responses API model.');
assert.ok(analyticsAgentSource.includes("process.env.OPENAI_ANALYTICS_MODEL || process.env.OPENAI_MODEL || 'gpt-6-astra'"), 'Analytics agent must default to the selected current Responses API model.');
const paypalMcpSource = await (await import('node:fs/promises')).readFile(new URL('../lib/paypal-mcp.js', import.meta.url), 'utf8');
assert.ok(paypalMcpSource.includes("'list_products'"), 'PayPal MCP allowlist must use the documented plural list_products tool name.');
assert.ok(!paypalMcpSource.includes("'list_product'"), 'PayPal MCP allowlist must not use the incorrect singular list_product tool name.');
assert.ok(!paypalMcpSource.includes('get_merchant_insights'), 'PayPal MCP allowlist must not reference an undocumented merchant-insight tool.');
const proofSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/proof/route.js', import.meta.url), 'utf8');
assert.ok(!/url:\s*offer\.url/.test(proofSource), 'Purchase Proof must not persist/return short-lived Channel3 affiliate URLs.');
console.log('API-first guardrail checks passed');

const proxySource = await (await import('node:fs/promises')).readFile(new URL('../proxy.js', import.meta.url), 'utf8');
assert.ok(proxySource.includes('export function proxy(request)'), 'Next.js 16 must use the proxy.js convention and proxy export.');

const frontendPackage = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../frontend/package.json', import.meta.url), 'utf8'));
const frontendDeps = frontendPackage.dependencies;
assert.equal(frontendDeps['ag-studio'], '3.1.0', 'AG Studio version must match ag-studio-react.');
assert.equal(frontendDeps['ag-studio-react'], '3.1.0', 'AG Studio React wrapper must match core.');
assert.equal(frontendDeps['ag-grid-community'], '36.3.0', 'AG Studio 3.1 requires the matching AG Grid 36.3 family.');
assert.equal(frontendDeps['ag-grid-react'], '36.3.0', 'AG Grid React wrapper must match community core.');
assert.equal(frontendDeps['ag-charts-community'], '14.3.0', 'AG Studio 3.1 requires the matching AG Charts 14.3 family.');
assert.equal(frontendDeps['@paypal/react-paypal-js'], '10.6.1', 'PayPal React SDK should use the current v6 wrapper release.');
assert.equal(frontendDeps.next, '16.4.6', 'Frontend must use the patched Next.js 16 release.');
assert.equal(frontendDeps.react, '19.3.1', 'Frontend React version must be pinned.');
assert.equal(frontendDeps['react-dom'], '19.3.1', 'Frontend React DOM must match React.');
const backendPackage = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(backendPackage.dependencies.next, '16.4.6', 'Backend must use the same patched Next.js version.');
assert.equal(backendPackage.dependencies.react, '19.3.1', 'Backend React version must match frontend.');
assert.equal(backendPackage.dependencies['react-dom'], '19.3.1', 'Backend React DOM version must match React.');


// Guardrail: capture-order route must import markMandateStatus (called at the policy re-check failure path on line 97).
const captureOrderSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/paypal/capture-order/route.js', import.meta.url), 'utf8');
assert.ok(captureOrderSource.includes('markMandateStatus'), 'capture-order route must import markMandateStatus from db.js.');

// Guardrail: dedicated tamper-test route must exist and must never call PayPal.
const tamperTestSource = await (await import('node:fs/promises')).readFile(new URL('../app/api/security/tamper-test/route.js', import.meta.url), 'utf8');
assert.ok(tamperTestSource.includes('paypalOrderCreated: false'), 'Dedicated tamper-test route must explicitly assert no PayPal order was created.');
assert.ok(!tamperTestSource.includes('paypalRequest'), 'Dedicated tamper-test route must never call the PayPal API.');

console.log('Package version and route guardrail checks passed.');
