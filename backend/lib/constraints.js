import { PRODUCTS } from './catalog.js';

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20
});

function parsedCount(value, fallback) {
  if (!value) return fallback;
  const normalized = String(value).toLowerCase();
  return NUMBER_WORDS[normalized] || Number(normalized) || fallback;
}

const COUNT_PATTERN = '(?:\\d+|' + Object.keys(NUMBER_WORDS).join('|') + ')';

export function parseConstraints(text) {
  const lower = String(text).toLowerCase();
  // Accept common explicit USD ceilings, including "budget of $1,500",
  // "up to 1500 USD" and "no more than $1,500". Do not infer a budget
  // from quantities or delivery-day counts.
  const budgetMatch = lower.match(/\b(?:under|below|less\s+than|up\s+to|no\s+more\s+than|not\s+exceed(?:ing)?|maximum|max(?:imum)?(?:\s+spend)?|budget(?:\s+(?:of|is))?|spending\s+cap)\b\s*[:=]?\s*(?:usd\s*)?\$?\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\s*(?:days?|business\s+days?))/i)
    || lower.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\s*(?:days?|business\s+days?))/i)
    || lower.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:usd|us\s*dollars?)\b/i);
  const budget = budgetMatch?.[1];
  const qty = lower.match(new RegExp(`\\b(${COUNT_PATTERN})\\s+(?:[a-z0-9-]+\\s+){0,5}(chairs?|desks?|monitors?|keyboards?|headsets?|docks?|stands?|lamps?|cameras?)`, 'i'));
  const days = lower.match(new RegExp(`(?:within|under|in)\\s*(${COUNT_PATTERN})\\s*(?:days?|business days?)`, 'i'))?.[1];
  const categories = [];
  if (/chair|desk|lamp|stand|office/.test(lower)) categories.push('office');
  if (/monitor|keyboard|headset|dock|camera|electronics/.test(lower)) categories.push('electronics');
  return {
    quantityExplicit: Boolean(qty),
    budgetExplicit: Boolean(budget),
    budget: budget ? Number(budget.replace(/,/g, '')) : 0,
    quantity: qty ? parsedCount(qty[1], 1) : 1,
    query: qty ? qty[2].replace(/s$/i, '') : lower,
    maxDaysExplicit: Boolean(days),
    maxDays: days ? parsedCount(days, 30) : 30,
    categories: categories.length ? categories : ['office', 'electronics'],
    allowedMerchants: [...new Set(PRODUCTS.map((p) => p.merchant).filter((merchant) => lower.includes(merchant.toLowerCase())))],
    demoTagPreference: /recycled(?:-material)?(?:\s+sample)?|sample recycled|demo material tag/.test(lower)
  };
}

