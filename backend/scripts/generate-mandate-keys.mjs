import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const b64 = (pem) => Buffer.from(pem, 'utf8').toString('base64');
console.log(`MANDATE_PRIVATE_KEY_B64=${b64(privateKey)}`);
console.log(`MANDATE_PUBLIC_KEY_B64=${b64(publicKey)}`);
console.error('\nCopy both lines into your local/production environment. Do not commit them.');
