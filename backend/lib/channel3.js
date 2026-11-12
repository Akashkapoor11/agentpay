const CHANNEL3_URL = 'https://api.trychannel3.com/v1/search';

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function priceValue(value) {
  if (value && typeof value === 'object') {
    return firstDefined(value.price, value.amount, value.value);
  }
  return value;
}

function normalizedAvailability(offer, product) {
  const raw = firstDefined(
    offer.availability,
    offer.availability_status,
    offer.stock_status,
    product.availability,
    product.availability_status,
    product.stock_status
  );
  const token = String(raw ?? '').toLowerCase().replace(/[\s_-]/g, '');
  const availableFlag = firstDefined(offer.available, offer.is_available, product.available);
  const inStockFlag = firstDefined(offer.in_stock, product.in_stock);

  if (availableFlag === true || inStockFlag === true || ['instock', 'available', 'in stock'].includes(token)) return 'IN_STOCK';
  if (availableFlag === false || inStockFlag === false || ['outofstock', 'unavailable', 'soldout'].includes(token)) return 'OUT_OF_STOCK';
  return 'UNKNOWN';
}

/**
 * Convert a Channel3 Product plus one of its merchant offers into the narrow,
 * display-only AgentPay market observation shape. External offers never become
 * executable PayPal catalogue items.
 */
export function normalizeOffer(raw = {}, retrievedAt = new Date().toISOString()) {
  const product = raw.product || raw;
  const offer = raw.offer || raw.offers?.[0] || raw;
  const rawPrice = firstDefined(offer.price, product.price);
  const parsedPrice = Number(priceValue(rawPrice));
  const currency = firstDefined(
    offer.currency,
    offer.currency_code,
    rawPrice && typeof rawPrice === 'object' ? rawPrice.currency : undefined,
    rawPrice && typeof rawPrice === 'object' ? rawPrice.currency_code : undefined,
    product.currency,
    product.currency_code
  );
  const availabilityStatus = normalizedAvailability(offer, product);

  const productId = String(firstDefined(product.id, product.product_id, '')).slice(0, 180);
  const offerId = String(firstDefined(offer.id, '')).slice(0, 180);
  return {
    externalId: productId || offerId,
    productId: productId || null,
    offerId: offerId || null,
    name: String(firstDefined(product.title, product.name, 'Untitled product')).slice(0, 180),
    merchant: String(firstDefined(offer.domain, offer.retailer_name, offer.merchant, offer.retailer, product.domain, 'Unknown merchant')).slice(0, 120),
    price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? Math.round((parsedPrice + Number.EPSILON) * 100) / 100 : null,
    currency: String(currency || 'UNKNOWN').toUpperCase().slice(0, 7),
    availabilityStatus,
    available: availabilityStatus === 'IN_STOCK' ? true : availabilityStatus === 'OUT_OF_STOCK' ? false : null,
    source: 'Channel3',
    retrievedAt
  };
}

/** Extract the documented paginated Channel3 Product array and tolerate
 * compatibility envelopes used by proxies and older integrations. */
export function extractChannel3Products(payload) {
  const candidates = [
    payload?.data,
    payload?.products,
    payload?.results,
    payload?.items,
    payload?.data?.products,
    payload?.data?.items,
    payload?.page?.data,
    payload?.page?.items
  ];
  return candidates.find(Array.isArray) || [];
}

/** Flatten one Product into one observation per merchant offer. */
export function normalizeSearchResults(payload, retrievedAt = new Date().toISOString()) {
  return extractChannel3Products(payload).flatMap((product) => {
    const offers = Array.isArray(product?.offers) ? product.offers : [];
    if (offers.length) return offers.map((offer) => normalizeOffer({ product, offer }, retrievedAt));
    return [normalizeOffer(product, retrievedAt)];
  }).filter((offer) => offer.name);
}

export async function channel3Search(query, { maxPrice, limit = 6, userId } = {}) {
  if (!process.env.CHANNEL3_API_KEY) return { configured: false, offers: [] };
  const response = await fetch(CHANNEL3_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.CHANNEL3_API_KEY,
      'x-user-id': process.env.CHANNEL3_USER_ID || userId || 'agentpay'
    },
    body: JSON.stringify({
      query: String(query || '').slice(0, 200),
      limit: Math.max(1, Math.min(20, Number(limit) || 6)),
      filters: Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0 ? { price: { max_price: Number(maxPrice) } } : undefined
    }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store'
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Channel3 search failed (${response.status}): ${body.slice(0, 240)}`);
  }
  const data = await response.json();
  const retrievedAt = new Date().toISOString();
  return { configured: true, offers: normalizeSearchResults(data, retrievedAt) };
}
