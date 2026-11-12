// Demo execution catalogue. Prices, stock and delivery estimates are synthetic fixtures
// for the PayPal Sandbox prototype; they are not live merchant quotations.
export const PRODUCTS = [
  { id: 'NV-C01', name: 'Nova Ergo Chair', category: 'office', price: 229, shippingDays: 2, merchant: 'NovaForm', stock: 22, tags: ['ergonomic', 'chair', 'recycled-material-demo-tag', 'team'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'AE-C02', name: 'AeroMesh Pro Chair', category: 'office', price: 189, shippingDays: 3, merchant: 'AeroWorks', stock: 48, tags: ['ergonomic', 'chair', 'mesh', 'team'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'FS-C03', name: 'FlexSeat Air', category: 'office', price: 159, shippingDays: 5, merchant: 'FlexSeat', stock: 66, tags: ['chair', 'mesh', 'budget'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'LM-D01', name: 'Lumi Standing Desk', category: 'office', price: 449, shippingDays: 4, merchant: 'Lumi', stock: 19, tags: ['desk', 'standing', 'ergonomic'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'OV-M01', name: 'Orbit 27 Monitor', category: 'electronics', price: 279, shippingDays: 3, merchant: 'OrbitView', stock: 31, tags: ['monitor', 'display', 'office'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'PX-M02', name: 'PixelPro 27 4K', category: 'electronics', price: 399, shippingDays: 4, merchant: 'PixelPro', stock: 14, tags: ['monitor', '4k', 'display'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'QS-K01', name: 'QuietShift Mechanical Keyboard', category: 'electronics', price: 119, shippingDays: 2, merchant: 'QuietShift', stock: 73, tags: ['keyboard', 'mechanical', 'office'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'DL-K02', name: 'AirType Low-Profile Keyboard', category: 'electronics', price: 99, shippingDays: 3, merchant: 'AirType', stock: 92, tags: ['keyboard', 'office', 'low-profile'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'DK-U01', name: 'Universal USB-C Dock', category: 'electronics', price: 149, shippingDays: 2, merchant: 'DockLab', stock: 55, tags: ['dock', 'usb-c', 'laptop'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'FC-H01', name: 'Focus ANC Headset', category: 'electronics', price: 199, shippingDays: 3, merchant: 'Focus', stock: 28, tags: ['headset', 'noise', 'meetings'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'TC-V01', name: 'TeamCam 4K', category: 'electronics', price: 169, shippingDays: 3, merchant: 'TeamCam', stock: 40, tags: ['camera', 'video', 'meetings'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'LM-L01', name: 'Adaptive Desk Lamp', category: 'office', price: 89, shippingDays: 2, merchant: 'Lumi', stock: 80, tags: ['lamp', 'smart', 'desk'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'ST-S01', name: 'SecureLock Laptop Stand', category: 'office', price: 79, shippingDays: 2, merchant: 'SecureStand', stock: 100, tags: ['stand', 'laptop', 'portable'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' },
  { id: 'ER-K01', name: 'ErgoTrack Split Keyboard', category: 'electronics', price: 149, shippingDays: 3, merchant: 'ErgoTrack', stock: 26, tags: ['keyboard', 'ergonomic', 'split'], fixtureSource: 'AGENTPAY_DEMO_CATALOG' }
];

export function searchProducts(query = '', constraints = {}, limit = 8) {
  const terms = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const maxUnit = Number.isFinite(Number(constraints.maxUnitPrice)) && Number(constraints.maxUnitPrice) > 0 ? Number(constraints.maxUnitPrice) : Infinity;
  const maxDays = Number.isFinite(Number(constraints.maxDeliveryDays)) && Number(constraints.maxDeliveryDays) > 0 ? Number(constraints.maxDeliveryDays) : Infinity;
  const category = constraints.category ? String(constraints.category).toLowerCase() : '';
  const preferTags = Array.isArray(constraints.preferTags) ? constraints.preferTags.map((x) => String(x).toLowerCase()) : [];

  return PRODUCTS
    .map((product) => {
      const haystack = `${product.name} ${product.category} ${product.merchant} ${product.tags.join(' ')}`.toLowerCase();
      const keywordMatches = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
      const budgetFit = product.price <= maxUnit ? 1 : 0;
      const deliveryFit = product.shippingDays <= maxDays ? 1 : 0;
      const categoryFit = category && product.category === category ? 2 : category ? 0 : 1;
      const preferenceMatches = preferTags.filter((tag) => product.tags.includes(tag)).length;
      const fitScore = keywordMatches * 6 + budgetFit * 3 + deliveryFit * 3 + categoryFit * 2 + preferenceMatches * 2;
      return { ...product, keywordMatches, preferenceMatches, fitScore };
    })
    .filter((product) => product.price <= maxUnit && product.shippingDays <= maxDays && (!category || product.category === category) && (terms.length === 0 || product.keywordMatches > 0))
    .sort((a, b) => b.fitScore - a.fitScore || a.shippingDays - b.shippingDays || a.price - b.price)
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}

export function getProduct(id) {
  return PRODUCTS.find((product) => product.id === id);
}
