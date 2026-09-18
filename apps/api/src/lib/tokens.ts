import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import type { TokensResponse } from '@chipperly/shared/schemas/auth';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { sessions } from '../db/schema/accounts.js';
import { AppError } from '../plugins/errors.js';

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export interface AccessTokenPayload {
  readonly sub: string;
  readonly sid: string;
}

async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ sid: payload.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('invalid access token payload');
  }
  return { sub: payload.sub, sid: payload.sid };
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newRefreshTokenValue(): string {
  return randomBytes(32).toString('base64url');
}

function toResponse(accessToken: string, refreshToken: string): TokensResponse {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
  };
}

/** Starts a new session (register / login / oauth) and returns the first token pair. */
export async function issueTokens(
  userId: string,
  deviceId?: string,
  userAgent?: string,
): Promise<TokensResponse> {
  const sessionId = uuidv7();
  const refreshToken = newRefreshTokenValue();
  await db.insert(sessions).values({
    id: sessionId,
    user_id: userId,
    refresh_token_hash: hashRefreshToken(refreshToken),
    device_id: deviceId ?? null,
    user_agent: userAgent ?? null,
    expires_at: Date.now() + REFRESH_TTL_MS,
    revoked_at: null,
  });
  const accessToken = await signAccessToken({ sub: userId, sid: sessionId });
  return toResponse(accessToken, refreshToken);
}

/**
 * Verifies a refresh token and rotates it: the session row's hash is
 * replaced so the presented token cannot be reused, and a fresh access
 * token is issued for the same session.
 */
export async function rotateRefreshToken(refreshToken: string): Promise<TokensResponse> {
  const tokenHash = hashRefreshToken(refreshToken);
  const [row] = await db.select().from(sessions).where(eq(sessions.refresh_token_hash, tokenHash)).limit(1);
  if (!row || row.revoked_at !== null || row.expires_at < Date.now()) {
    throw new AppError(401, 'invalid_credentials', 'Invalid or expired refresh token');
  }
  const nextRefreshToken = newRefreshTokenValue();
  await db
    .update(sessions)
    .set({ refresh_token_hash: hashRefreshToken(nextRefreshToken), expires_at: Date.now() + REFRESH_TTL_MS })
    .where(eq(sessions.id, row.id));
  const accessToken = await signAccessToken({ sub: row.user_id, sid: row.id });
  return toResponse(accessToken, nextRefreshToken);
}

/** Logout: revokes the session so its refresh token (and any future rotation of it) stops working. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revoked_at: Date.now() }).where(eq(sessions.id, sessionId));
}

export async function revokeByRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await db.update(sessions).set({ revoked_at: Date.now() }).where(eq(sessions.refresh_token_hash, tokenHash));
}
