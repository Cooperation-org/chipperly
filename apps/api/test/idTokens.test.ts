import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { verifyAppleIdToken } from '../src/lib/apple.js';
import { verifyGoogleIdToken } from '../src/lib/google.js';

// The real verifiers, with the identity providers' key servers replaced by one local key.
// Proves the issuer, audience and expiry checks; it cannot prove Google or Apple accept our client ids.

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwks: { keys: unknown[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const serveKeys = () =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(jwks), { headers: { 'content-type': 'application/json' } })));

const sign = (claims: Record<string, unknown>, iss: string, aud: string, exp = '5m') =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);

describe('Google id token check', () => {
  it('accepts a good token and rejects a wrong audience, wrong issuer and an expired one', async () => {
    env.GOOGLE_OAUTH_CLIENT_ID = 'chipperly-google-client';
    serveKeys();
    const claims = { sub: 'g-1', email: 'a@example.com', email_verified: true, name: 'A' };
    await expect(verifyGoogleIdToken(await sign(claims, 'https://accounts.google.com', 'chipperly-google-client'))).resolves.toMatchObject({ sub: 'g-1', email: 'a@example.com', email_verified: true });
    await expect(verifyGoogleIdToken(await sign(claims, 'https://accounts.google.com', 'someone-elses-client'))).rejects.toThrow();
    await expect(verifyGoogleIdToken(await sign(claims, 'https://evil.example.com', 'chipperly-google-client'))).rejects.toThrow();
    await expect(verifyGoogleIdToken(await sign(claims, 'https://accounts.google.com', 'chipperly-google-client', '-1m'))).rejects.toThrow();
  });
});

describe('Apple id token check', () => {
  it('accepts a good token and reads the string form of email_verified; rejects a wrong audience', async () => {
    env.APPLE_SIGNIN_CLIENT_ID = 'com.chipperly.web';
    env.appleEnabled = true;
    serveKeys();
    const claims = { sub: 'ap-1', email: 'b@example.com', email_verified: 'true' };
    await expect(verifyAppleIdToken(await sign(claims, 'https://appleid.apple.com', 'com.chipperly.web'))).resolves.toMatchObject({ sub: 'ap-1', email_verified: true });
    await expect(verifyAppleIdToken(await sign(claims, 'https://appleid.apple.com', 'com.other.app'))).rejects.toThrow();
  });
});
