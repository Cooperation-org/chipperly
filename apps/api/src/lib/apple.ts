import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';
import type { VerifiedIdentity } from './google.js';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export async function verifyAppleIdToken(idToken: string): Promise<VerifiedIdentity> {
  if (!env.appleEnabled) {
    throw new AppError(404, 'not_found', 'Sign in with Apple is not enabled');
  }
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: env.APPLE_SIGNIN_CLIENT_ID,
  });
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new AppError(401, 'invalid_credentials', 'Invalid Apple id_token');
  }
  return {
    sub,
    email,
    email_verified: payload.email_verified === true || payload.email_verified === 'true',
    name: null,
  };
}
