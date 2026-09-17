import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export interface VerifiedIdentity {
  readonly sub: string;
  readonly email: string;
  readonly email_verified: boolean;
  readonly name: string | null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedIdentity> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new AppError(404, 'not_found', 'Google sign-in is not enabled');
  }
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new AppError(401, 'invalid_credentials', 'Invalid Google id_token');
  }
  return {
    sub,
    email,
    email_verified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}
