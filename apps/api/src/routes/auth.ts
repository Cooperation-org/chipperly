import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
import { email_verifications, invites, password_resets, sessions, users } from '../db/schema/accounts.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { sendMail } from '../lib/mailer.js';
import { verifyGoogleIdToken, type VerifiedIdentity } from '../lib/google.js';
import { verifyAppleIdToken } from '../lib/apple.js';
import { issueTokens, revokeByRefreshToken, revokeSession, rotateRefreshToken } from '../lib/tokens.js';
import { AppError } from '../plugins/errors.js';

// ponytail: e2e (TEST_ENDPOINTS=1, see app.ts) runs 20+ real registrations
// from a single loopback IP across spec files and projects in one server
// process, well past a production-sane 10-per-3-min cap; only that flag
// relaxes it, production keeps the tight limit.
const AUTH_RATE_LIMIT = {
  config: {
    rateLimit:
      process.env.TEST_ENDPOINTS === '1'
        ? { max: 1000, timeWindow: '3 minutes' }
        : { max: 10, timeWindow: '3 minutes' },
  },
};
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
 * Constant-time invite code check (sec: avoids leaking the code length or
 * value through response-time differences). No configured code = nothing to
 * check. Length mismatch is simply invalid, same as `timingSafeEqual` requires.
 */
export function isValidInviteCode(configured: string | undefined, provided: string | undefined): boolean {
  if (!configured) return true;
  if (!provided) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A pending account invite bypasses the beta code: valid token, not expired. Accepting it still needs sign-in. */
async function isValidPendingInvite(rawToken: string): Promise<boolean> {
  const [invite] = await db
    .select({ expires_at: invites.expires_at })
    .from(invites)
    .where(eq(invites.token_hash, hashToken(rawToken)))
    .limit(1);
  return invite !== undefined && invite.expires_at > Date.now();
}

/**
 * Shared closed-beta gate for register and, when they'd create a new user, /auth/google and
 * /auth/apple: no-op when no beta code is configured, otherwise a valid invite_token (a pending
 * account invite) bypasses it, else invite_code must match.
 */
async function requireInviteGate(inviteCode: string | undefined, inviteToken: string | undefined): Promise<void> {
  if (!env.BETA_INVITE_CODE) return;
  const bypassed = inviteToken ? await isValidPendingInvite(inviteToken) : false;
  if (!bypassed && !isValidInviteCode(env.BETA_INVITE_CODE, inviteCode)) {
    throw new AppError(403, 'invite_code_invalid', "That invite code isn't right.");
  }
}

/**
 * Finds the user for a verified OAuth identity, linking the provider to an
 * existing password account by email when the provider says that email is
 * verified. Returns null when no user exists yet, so the caller can check
 * the beta invite code before `createOAuthUser` actually creates one.
 */
async function findOAuthUser(provider: 'google' | 'apple', identity: VerifiedIdentity): Promise<string | null> {
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

  return null;
}

async function createOAuthUser(
  provider: 'google' | 'apple',
  identity: VerifiedIdentity,
  consentedAt: number,
): Promise<string> {
  const newUserId = uuidv7();
  await db.insert(users).values({
    id: newUserId,
    email: identity.email.toLowerCase(),
    auth_provider: provider,
    auth_provider_id: identity.sub,
    display_name: identity.name ?? identity.email,
    email_verified_at: identity.email_verified ? Date.now() : null,
    consented_at: consentedAt,
    created_at: Date.now(),
  });
  return newUserId;
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', AUTH_RATE_LIMIT, async (request): Promise<TokensResponse> => {
    const body = RegisterBodySchema.parse(request.body);
    const email = body.email.toLowerCase();

    await requireInviteGate(body.invite_code, body.invite_token);

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new AppError(409, 'email_taken', 'An account with this email already exists');

    const passwordHash = await hashPassword(body.password);
    const userId = uuidv7();
    await db.insert(users).values({
      id: userId,
      email,
      password_hash: passwordHash,
      display_name: body.display_name,
      consented_at: body.consented_at,
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
    return { google: env.googleEnabled, apple: env.appleEnabled, invite_code_required: env.inviteCodeRequired };
  });

  app.post('/auth/google', async (request): Promise<TokensResponse> => {
    if (!env.googleEnabled) throw new AppError(404, 'not_enabled', 'Google sign-in is not enabled');
    const body = GoogleAuthBodySchema.parse(request.body);
    const identity = await verifyGoogleIdToken(body.id_token);
    let userId = await findOAuthUser('google', identity);
    if (!userId) {
      await requireInviteGate(body.invite_code, body.invite_token);
      if (!body.consented_at) throw new AppError(409, 'consent_required', 'Agree to the Terms and Privacy Policy first');
      userId = await createOAuthUser('google', identity, body.consented_at);
    }
    return issueTokens(userId, undefined, userAgentOf(request));
  });

  app.post('/auth/apple', async (request): Promise<TokensResponse> => {
    if (!env.appleEnabled) throw new AppError(404, 'not_enabled', 'Sign in with Apple is not enabled');
    const body = AppleAuthBodySchema.parse(request.body);
    const identity = await verifyAppleIdToken(body.id_token);
    let userId = await findOAuthUser('apple', identity);
    if (!userId) {
      await requireInviteGate(body.invite_code, body.invite_token);
      if (!body.consented_at) throw new AppError(409, 'consent_required', 'Agree to the Terms and Privacy Policy first');
      userId = await createOAuthUser('apple', identity, body.consented_at);
    }
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
