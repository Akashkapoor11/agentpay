const paypalEnv = process.env.PAYPAL_ENV || 'sandbox';
if (paypalEnv !== 'sandbox') throw new Error('AgentPay supports PayPal Sandbox only for this hackathon build.');
const baseUrl = 'https://api-m.sandbox.paypal.com';

export async function getPayPalAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new Error('PayPal Sandbox credentials are not configured.');
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en_US' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || data?.message || `PayPal token request failed (${response.status}).`);
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('PayPal did not return an access token.');
  return data.access_token;
}

export async function paypalRequest(path, options = {}) {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(25000),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.details?.[0]?.description || `PayPal request failed (${response.status}).`);
  return data;
}
