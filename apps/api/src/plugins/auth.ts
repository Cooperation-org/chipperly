import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { account_members, accounts, sessions } from '../db/schema/accounts.js';
import { profiles, profile_members } from '../db/schema/profiles.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { AppError } from './errors.js';

export interface AuthUser {
  readonly id: string;
  readonly session_id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    accountId: string | null;
    locked: boolean;
  }
}

/**
 * Not wrapped with `fastify-plugin` (not a project dependency): called
 * directly on the root app instance in app.ts, before any routes, so the
 * decorations and hook apply everywhere without an encapsulation boundary.
 */
export default async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('accountId', null);
  app.decorateRequest('locked', false);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.locked = false;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = await verifyAccessToken(authHeader.slice('Bearer '.length));
        request.user = { id: payload.sub, session_id: payload.sid };

        // Whether this device is child-locked is a fact about the server's
        // session row (set by POST /me/lock, cleared by POST /me/unlock
        // after a server-verified PIN), never a client-asserted header --
        // a caller can't just omit a header to get full-privilege writes.
        const [session] = await db
          .select({ locked_profile_id: sessions.locked_profile_id })
          .from(sessions)
          .where(eq(sessions.id, payload.sid))
          .limit(1);
        request.locked = session?.locked_profile_id != null;
      } catch {
        // Invalid or expired token: request.user stays null, requireUser rejects it.
      }
    }

    const accountHeader = request.headers['x-account-id'];
    const accountId = Array.isArray(accountHeader) ? accountHeader[0] : accountHeader;
    if (request.user && accountId) {
      const [membership] = await db
        .select()
        .from(account_members)
        .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, request.user.id)))
        .limit(1);
      // A foreign or stale id (left from another sign-in on this device) is
      // ignored, not a 403: throwing here blocked /auth/login and /me too, so
      // the user could never sign in again. Account routes still refuse via
      // requireAccount because request.accountId stays unset.
      if (membership) request.accountId = accountId;
    }
  });
}

export async function requireUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError(401, 'unauthorized', 'Sign-in required');
  }
}

export async function requireAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireUser(request, reply);
  if (!request.accountId) {
    throw new AppError(400, 'missing_account', 'X-Account-Id header required');
  }
}

/** True when `userId` is an admin of the profile's account, or a member listed in profile_members. */
export async function canAccessProfile(userId: string, profileId: string): Promise<boolean> {
  const [profile] = await db
    .select({ account_id: profiles.account_id })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) return false;

  const [membership] = await db
    .select()
    .from(account_members)
    .where(and(eq(account_members.account_id, profile.account_id), eq(account_members.user_id, userId)))
    .limit(1);
  if (!membership) return false;
  if (membership.role === 'admin') return true;

  const [profileMember] = await db
    .select()
    .from(profile_members)
    .where(and(eq(profile_members.profile_id, profileId), eq(profile_members.user_id, userId)))
    .limit(1);
  return Boolean(profileMember);
}

/** Same rule as read access: an admin writes every profile, a member only the ones they're listed on. */
export async function canWriteProfile(userId: string, profileId: string): Promise<boolean> {
  return canAccessProfile(userId, profileId);
}

/**
 * True when `userId` is `accountId`'s owner: the single account member more
 * privileged than any other admin (e.g. gating the parent-only location
 * history feature away from a co-admin therapist). Distinct from
 * `role === 'admin'`, which multiple members can hold.
 */
export async function isAccountOwner(userId: string, accountId: string): Promise<boolean> {
  const [account] = await db.select({ owner_user_id: accounts.owner_user_id }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return account?.owner_user_id === userId;
}
