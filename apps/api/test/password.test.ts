import { describe, expect, it } from 'vitest';
import { hashPassword, hashPin, verifyPassword, verifyPin } from '../src/lib/password.js';

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
});
