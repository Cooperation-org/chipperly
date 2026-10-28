// node ops/access.test.mjs
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyAccessJwt } from './access.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const make = (claims, { kid = 'k1', alg = 'RS256', key = privateKey } = {}) => {
  const head = `${b64({ alg, kid })}.${b64(claims)}`;
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
};
const opts = { team: 'chipperly.cloudflareaccess.com', aud: 'AUD1' };
const keys = { k1: publicKey };
const good = { aud: ['AUD1'], iss: 'https://chipperly.cloudflareaccess.com', exp: Date.now() / 1000 + 60, email: 'a@b.c' };

assert.equal(verifyAccessJwt(make(good), keys, opts), 'a@b.c');
assert.equal(verifyAccessJwt(make({ ...good, aud: ['OTHER'] }), keys, opts), null, 'wrong app');
assert.equal(verifyAccessJwt(make({ ...good, iss: 'https://evil.cloudflareaccess.com' }), keys, opts), null, 'wrong team');
assert.equal(verifyAccessJwt(make({ ...good, exp: Date.now() / 1000 - 1 }), keys, opts), null, 'expired');
assert.equal(verifyAccessJwt(make(good, { key: other.privateKey }), keys, opts), null, 'signed by someone else');
assert.equal(verifyAccessJwt(make(good, { kid: 'nope' }), keys, opts), null, 'unknown key');
assert.equal(verifyAccessJwt(make(good, { alg: 'none' }), keys, opts), null, 'alg none');
const [h, , s] = make(good).split('.');
assert.equal(verifyAccessJwt(`${h}.${b64({ ...good, email: 'x@y.z' })}.${s}`, keys, opts), null, 'tampered claims');
assert.equal(verifyAccessJwt(make(good), keys, { team: '', aud: '' }), null, 'not configured = closed');
assert.equal(verifyAccessJwt(undefined, keys, opts), null);
console.log('access: all checks passed');
