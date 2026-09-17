import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatPinHash, parsePinHash } from '@chipperly/shared/helpers/pin';
import { hashPassword, hashPin, verifyPassword, verifyPin } from '../src/lib/password.js';

/**
 * Reference derivation matching the client's WebCrypto implementation
 * (apps/web/lib/auth/pin.ts), independent of the server's Node
 * `crypto.pbkdf2` code path: proof the two agree on what a salt means.
 */
async function webCryptoDerive(pin: string, salt: Uint8Array, iterations: number, keylenBytes: number): Promise<Buffer> {
  const keyMaterial = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    keylenBytes * 8,
  );
  return Buffer.from(bits);
}

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('salts each hash differently', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });
});

describe('pin hashing', () => {
  it('matches the CONTRACTS.md pbkdf2$<iterations>$<salt>$<hash> format', async () => {
    const hash = await hashPin('4242');
    expect(hash).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('verifies the correct pin and rejects a wrong one', async () => {
    const hash = await hashPin('4242');
    expect(await verifyPin('4242', hash)).toBe(true);
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it("hashPin's output derives the same bytes the client's WebCrypto path would, for the same decoded salt", async () => {
    const stored = await hashPin('4242');
    const { iterations, salt, hash } = parsePinHash(stored);
    const saltBytes = Buffer.from(salt, 'base64url');
    const expectedBytes = Buffer.from(hash, 'base64url');

    const reference = await webCryptoDerive('4242', saltBytes, iterations, expectedBytes.length);
    expect(reference.equals(expectedBytes)).toBe(true);
  });

  it('verifyPin accepts a hash produced the way the client produces one (WebCrypto, decoded salt bytes)', async () => {
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iterations = 100_000;
    const derived = await webCryptoDerive('4242', salt, iterations, 32);

    function toBase64Url(bytes: Uint8Array): string {
      return Buffer.from(bytes).toString('base64url');
    }

    const clientStyleHash = formatPinHash(toBase64Url(salt), toBase64Url(derived), iterations);
    expect(await verifyPin('4242', clientStyleHash)).toBe(true);
    expect(await verifyPin('0000', clientStyleHash)).toBe(false);
  });
});
