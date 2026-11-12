import { createHash } from 'node:crypto';

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

export function toCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error('Money values must be finite and non-negative.');
  const cents = Math.round((numeric + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('Money values exceed the supported safe-integer range.');
  return cents;
}

export function fromCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Money cents must be a non-negative safe integer.');
  return value / 100;
}

export function normalizeCart(items = []) {
  if (!Array.isArray(items)) throw new Error('Cart items must be an array.');
  return items.map((item) => {
    const id = String(item?.id ?? item?.productId ?? '').trim();
    const quantity = Number(item?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error('Cart items require a product ID and an integer quantity between 1 and 50.');
    }
    const priceCents = toCents(item?.price ?? item?.unit_amount?.value ?? 0);
    if (priceCents < 1) throw new Error('Cart item prices must be greater than zero.');
    const currency = String(item?.currency ?? item?.unit_amount?.currency_code ?? 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Cart currency must be a three-letter ISO currency code.');
    return { id, quantity, priceCents, currency };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.currency.localeCompare(b.currency) || a.priceCents - b.priceCents);
}

export function cartCommitment(items = []) {
  return createHash('sha256').update(stable(normalizeCart(items))).digest('hex').toUpperCase();
}
