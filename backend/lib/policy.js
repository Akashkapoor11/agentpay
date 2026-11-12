import { toCents } from './cart.js';

function safeCents(value) {
  try {
    return toCents(value);
  } catch {
    return null;
  }
}

/**
 * Deterministic authorization policy. This function makes no fraud prediction;
 * it checks the signed mandate against the canonical server-side cart.
 */
export function evaluateMandate({ mandate, items, total }) {
  const reasons = [];
  const violations = [];
  const safeItems = Array.isArray(items) ? items : [];
  const totalCents = safeCents(total);
  const maxTotalCents = safeCents(mandate?.maxTotal);
  const maxDays = Number(mandate?.maxDeliveryDays || 0);
  const expectedCurrency = String(mandate?.currency || 'USD').toUpperCase();
  const allowedCategories = new Set((Array.isArray(mandate?.allowedCategories) ? mandate.allowedCategories : []).map((x) => String(x).toLowerCase()));
  const allowedMerchants = (Array.isArray(mandate?.allowedMerchants) ? mandate.allowedMerchants : []).map((x) => String(x).toLowerCase());

  if (!safeItems.length) violations.push('The cart must contain at least one item.');
  if (totalCents === null || totalCents < 1) violations.push('The purchase total must be a positive amount in cents.');
  if (maxTotalCents === null || maxTotalCents < 1) violations.push('An explicit positive spending ceiling is required.');
  if (!/^[A-Z]{3}$/.test(expectedCurrency)) violations.push('The mandate currency is invalid.');
  if (totalCents !== null && maxTotalCents !== null && totalCents > maxTotalCents) {
    violations.push(`Total ${expectedCurrency} ${(totalCents / 100).toFixed(2)} exceeds mandate ceiling ${expectedCurrency} ${(maxTotalCents / 100).toFixed(2)}.`);
  }
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 365) violations.push('A valid delivery limit is required.');
  if (safeItems.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 50)) {
    violations.push('Every item quantity must be an integer between 1 and 50.');
  }
  if (safeItems.some((item) => {
    const cents = safeCents(item.price);
    const currency = String(item.currency || 'USD').toUpperCase();
    return cents === null || cents < 1 || currency !== expectedCurrency;
  })) {
    violations.push('Every item must have a positive, valid price in the mandate currency.');
  }

  let computedItemsCents = 0;
  let computedTotalIsSafe = true;
  for (const item of safeItems) {
    const unitCents = safeCents(item.price);
    const quantity = Number(item.quantity);
    if (unitCents === null || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      computedTotalIsSafe = false;
      continue;
    }
    computedItemsCents += unitCents * quantity;
    if (!Number.isSafeInteger(computedItemsCents)) computedTotalIsSafe = false;
  }
  if (!computedTotalIsSafe || totalCents === null || computedItemsCents !== totalCents) {
    violations.push('The submitted total does not equal the sum of the canonical cart line items.');
  }

  if (safeItems.some((item) => !Number.isFinite(Number(item.shippingDays)) || Number(item.shippingDays) < 0 || Number(item.shippingDays) > maxDays)) {
    violations.push(`At least one catalogue delivery estimate exceeds the ${maxDays}-day limit.`);
  }
  if (!allowedCategories.size) violations.push('At least one allowed purchase category must be specified.');
  if (allowedCategories.size && safeItems.some((item) => !allowedCategories.has(String(item.category || '').toLowerCase()))) {
    violations.push('The cart contains a category outside the mandate.');
  }
  if (allowedMerchants.length && safeItems.some((item) => !allowedMerchants.includes(String(item.merchant || '').toLowerCase()))) {
    violations.push('The cart contains a merchant outside the mandate.');
  }

  const utilization = maxTotalCents > 0 && totalCents !== null ? totalCents / maxTotalCents : 1;
  const budgetUtilizationPct = Number((utilization * 100).toFixed(1));
  if (!violations.length && utilization <= 0.75) reasons.push('Spend is comfortably below the authorised ceiling.');
  else if (!violations.length) reasons.push('Spend is within the mandate and close to its authorised ceiling.');
  if (!violations.length) reasons.push('Every canonical cart line matches the signed currency, spending ceiling, delivery and category constraints.');

  return {
    status: violations.length ? 'BLOCK' : 'PASS',
    budgetUtilizationPct,
    utilization: budgetUtilizationPct,
    reasons,
    violations
  };
}
