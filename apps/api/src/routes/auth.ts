import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  AppleAuthBodySchema,
  ForgotPasswordBodySchema,
  GoogleAuthBodySchema,
  LoginBodySchema,
  RefreshBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
  type TokensResponse,
} from '@chipperly/shared/schemas/auth';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { email_verifications, password_resets, sessions, users } from '../db/schema/accounts.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { sendMail } from '../lib/mailer.js';
import { verifyGoogleIdToken, type VerifiedIdentity } from '../lib/google.js';
import { verifyAppleIdToken } from '../lib/apple.js';
import { issueTokens, revokeByRefreshToken, revokeSession, rotateRefreshToken } from '../lib/tokens.js';
import { AppError } from '../plugins/errors.js';

const AUTH_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '3 minutes' } } };
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const LogoutBodySchema = RefreshBodySchema.partial();

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function userAgentOf(request: FastifyRequest): string | undefined {
  return headerString(request.headers['user-agent']);
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newRawToken(): string {
  return randomBytes(32).toString('base64url');
}

async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const rawToken = newRawToken();
  await db.insert(email_verifications).values({
    id: uuidv7(),
    user_id: userId,
    token_hash: hashToken(rawToken),
    expires_at: Date.now() + EMAIL_VERIFICATION_TTL_MS,
    used_at: null,
  });
  const link = `${env.APP_ORIGIN ?? ''}${env.BASE_PATH}/verify/?token=${rawToken}`;
  await sendMail({
    to: email,
    subject: 'Verify your Chipperly email',
    text: `Welcome to Chipperly! Verify your email address: ${link}`,
  });
}

/**
 * Finds the user for a verified OAuth identity, linking the provider to an
 * existing password account by email when the provider says that email is
 * verified, or creating a new user otherwise.
 */
async function findOrCreateOAuthUser(provider: 'google' | 'apple', identity: VerifiedIdentity): Promise<string> {
  const email = identity.email.toLowerCase();

  const [byProvider] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.auth_provider, provider), eq(users.auth_provider_id, identity.sub)))
    .limit(1);
  if (byProvider) return byProvider.id;

  const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (byEmail) {
    if (!identity.email_verified) {
      throw new AppError(409, 'email_taken', 'An account with this email already exists');
    }
    await db
      .update(users)
      .set({ auth_provider: provider, auth_provider_id: identity.sub })
      .where(eq(users.id, byEmail.id));
    return byEmail.id;
  }

  const newUserId = uuidv7();
  await db.insert(users).values({
    id: newUserId,
    email,
    auth_provider: provider,
    auth_provider_id: identity.sub,
    display_name: identity.name ?? email,
    email_verified_at: identity.email_verified ? Date.now() : null,
    created_at: Date.now(),
  });
  return newUserId;
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', AUTH_RATE_LIMIT, async (request): Promise<TokensResponse> => {
    const body = RegisterBodySchema.parse(request.body);
    const email = body.email.toLowerCase();

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new AppError(409, 'email_taken', 'An account with this email already exists');

    const passwordHash = await hashPassword(body.password);
    const userId = uuidv7();
    await db.insert(users).values({
      id: userId,
      email,
      password_hash: passwordHash,
      display_name: body.display_name,
      created_at: Date.now(),
    });

    await sendVerificationEmail(userId, email);

    return issueTokens(userId, body.device_id, userAgentOf(request));
  });

  app.post('/auth/login', AUTH_RATE_LIMIT, async (request): Promise<TokensResponse> => {
    const body = LoginBodySchema.parse(request.body);
    const email = body.email.toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
    }

    return issueTokens(user.id, undefined, userAgentOf(request));
  });

  app.get('/auth/providers', async () => {
    return { google: env.googleEnabled, apple: env.appleEnabled };
  });

  app.post('/auth/google', async (request): Promise<TokensResponse> => {
    if (!env.googleEnabled) throw new AppError(404, 'not_enabled', 'Google sign-in is not enabled');
    const body = GoogleAuthBodySchema.parse(request.body);
    const identity = await verifyGoogleIdToken(body.id_token);
    const userId = await findOrCreateOAuthUser('google', identity);
    return issueTokens(userId, undefined, userAgentOf(request));
  });

  app.post('/auth/apple', async (request): Promise<TokensResponse> => {
    if (!env.appleEnabled) throw new AppError(404, 'not_enabled', 'Sign in with Apple is not enabled');
    const body = AppleAuthBodySchema.parse(request.body);
    const identity = await verifyAppleIdToken(body.id_token);
    const userId = await findOrCreateOAuthUser('apple', identity);
    return issueTokens(userId, undefined, userAgentOf(request));
  });

  app.post('/auth/refresh', async (request): Promise<TokensResponse> => {
    const body = RefreshBodySchema.parse(request.body);
    try {
      return await rotateRefreshToken(body.refresh_token);
    } catch (err) {
      if (err instanceof AppError) {
        throw new AppError(401, 'invalid_refresh', 'Invalid or expired refresh token');
      }
      throw err;
    }
  });

  app.post('/auth/logout', async (request) => {
    const body = LogoutBodySchema.parse(request.body ?? {});
    if (request.user) {
      await revokeSession(request.user.session_id);
    } else if (body.refresh_token) {
      await revokeByRefreshToken(body.refresh_token);
    } else {
      throw new AppError(401, 'unauthorized', 'Bearer token or refresh_token required');
    }
    return { ok: true };
  });

  app.post('/auth/password/forgot', AUTH_RATE_LIMIT, async (request) => {
    const body = ForgotPasswordBodySchema.parse(request.body);
    const email = body.email.toLowerCase();

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      const rawToken = newRawToken();
      await db.insert(password_resets).values({
        id: uuidv7(),
        user_id: user.id,
        token_hash: hashToken(rawToken),
        expires_at: Date.now() + PASSWORD_RESET_TTL_MS,
        used_at: null,
      });
      const link = `${env.APP_ORIGIN ?? ''}${env.BASE_PATH}/reset-password/?token=${rawToken}`;
      await sendMail({
        to: email,
        subject: 'Reset your Chipperly password',
        text: `Reset your password: ${link}`,
      });
    }

    return { ok: true };
  });

  app.post('/auth/password/reset', async (request) => {
    const body = ResetPasswordBodySchema.parse(request.body);
    const tokenHash = hashToken(body.token);
    const now = Date.now();

    const [resetRow] = await db
      .select()
      .from(password_resets)
      .where(eq(password_resets.token_hash, tokenHash))
      .limit(1);
    if (!resetRow || resetRow.used_at !== null || resetRow.expires_at < now) {
      throw new AppError(400, 'invalid_token', 'Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(body.password);
    await db.update(users).set({ password_hash: passwordHash }).where(eq(users.id, resetRow.user_id));
    await db.update(sessions).set({ revoked_at: now }).where(eq(sessions.user_id, resetRow.user_id));
    await db.update(password_resets).set({ used_at: now }).where(eq(password_resets.id, resetRow.id));

    return { ok: true };
  });

  app.get<{ Params: { token: string } }>('/auth/verify/:token', async (request) => {
    const tokenHash = hashToken(request.params.token);
    const now = Date.now();

    const [row] = await db
      .select()
      .from(email_verifications)
      .where(eq(email_verifications.token_hash, tokenHash))
      .limit(1);
    if (!row || row.used_at !== null || row.expires_at < now) {
      throw new AppError(400, 'invalid_token', 'Invalid or expired verification token');
    }

    await db.update(users).set({ email_verified_at: now }).where(eq(users.id, row.user_id));
    await db.update(email_verifications).set({ used_at: now }).where(eq(email_verifications.id, row.id));

    return { ok: true };
  });
}
