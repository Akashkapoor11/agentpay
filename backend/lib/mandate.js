import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';

let ephemeralKeyPair;

function keyPair() {
  const privateB64 = process.env.MANDATE_PRIVATE_KEY_B64;
  const publicB64 = process.env.MANDATE_PUBLIC_KEY_B64;
  if (privateB64 && publicB64) {
    return {
      privateKey: Buffer.from(privateB64, 'base64').toString('utf8'),
      publicKey: Buffer.from(publicB64, 'base64').toString('utf8')
    };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MANDATE_PRIVATE_KEY_B64 and MANDATE_PUBLIC_KEY_B64 are required in production. Run npm run keys:generate.');
  }
  if (!ephemeralKeyPair) {
    ephemeralKeyPair = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
  }
  return ephemeralKeyPair;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createMandate(payload) {
  const body = { ...payload, issuedAt: new Date().toISOString(), version: '1.0' };
  const canonical = stable(body);
  const keys = keyPair();
  const signature = sign(null, Buffer.from(canonical), keys.privateKey).toString('base64url');
  const fingerprint = createHash('sha256').update(canonical).digest('hex').slice(0, 32).toUpperCase();
  return { ...body, algorithm: 'Ed25519', signature, fingerprint };
}

export function verifyMandate(mandate) {
  if (!mandate?.signature || !mandate?.fingerprint || mandate.algorithm !== 'Ed25519') return false;
  if (!mandate.expiresAt || new Date(mandate.expiresAt).getTime() <= Date.now()) return false;
  const { signature, fingerprint, algorithm, ...body } = mandate;
  if (algorithm !== 'Ed25519') return false;
  const canonical = stable(body);
  const expected = createHash('sha256').update(canonical).digest('hex').slice(0, 32).toUpperCase();
  if (expected !== fingerprint) return false;
  try {
    const keys = keyPair();
    return verify(null, Buffer.from(canonical), keys.publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

export function mandatePublicKeyConfigured() {
  return Boolean(process.env.MANDATE_PRIVATE_KEY_B64 && process.env.MANDATE_PUBLIC_KEY_B64);
}
