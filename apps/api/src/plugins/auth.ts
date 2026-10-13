import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { account_members, accounts, sessions, users } from '../db/schema/accounts.js';
import { profiles, profile_members } from '../db/schema/profiles.js';
import { cluster_members } from '../db/schema/clusters.js';
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

/** Routes a person with a temporary password may still call (matched on the end of the route pattern). */
const MUST_CHANGE_EXEMPT = ['/me/change-password', '/auth/logout'];

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

        // A login an admin created with a temporary password does nothing until its owner picks their own.
        const [person] = await db.select({ must: users.must_change_password }).from(users).where(eq(users.id, payload.sub)).limit(1);
        if (person?.must && !MUST_CHANGE_EXEMPT.some((suffix) => request.routeOptions.url?.endsWith(suffix))) {
          throw new AppError(403, 'must_change_password', 'Choose a new password first.');
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
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

/**
 * True when `userId` is an admin of the profile's account, is listed in profile_members for it, or is
 * assigned to the group (cluster) the person is in and the person is not archived.
 * The single place for read access. Writes use the same rule; a viewer is then refused as read_only.
 */
export async function canAccessProfile(userId: string, profileId: string): Promise<boolean> {
  const [profile] = await db
    .select({ account_id: profiles.account_id, cluster_id: profiles.cluster_id, archived_at: profiles.archived_at })
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
  if (profileMember) return true;

  // Group rule: anyone assigned to the person's group sees them while they are not archived.
  if (profile.cluster_id && profile.archived_at === null) {
    const [inGroup] = await db
      .select({ id: cluster_members.cluster_id })
      .from(cluster_members)
      .where(and(eq(cluster_members.user_id, userId), eq(cluster_members.cluster_id, profile.cluster_id)))
      .limit(1);
    return Boolean(inGroup);
  }
  return false;
}

/**
 * Same rule as read access: an admin writes every profile, a member only the ones they're listed on.
 * A viewer passes too, on purpose: sync push must reach applyMutation, which refuses each of their
 * writes as 'read_only' so the device keeps them. Other write routes use assertCanWriteProfile.
 */
export async function canWriteProfile(userId: string, profileId: string): Promise<boolean> {
  return canAccessProfile(userId, profileId);
}

/** The 403 every write path gives a viewer. */
export function readOnlyError(): AppError {
  return new AppError(403, 'read_only', 'View only. Ask an admin to make changes.');
}

/** True when `userId` is a viewer in the profile's account (read only). */
export async function isViewerOfProfile(userId: string, profileId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: account_members.role })
    .from(account_members)
    .innerJoin(profiles, eq(profiles.account_id, account_members.account_id))
    .where(and(eq(profiles.id, profileId), eq(account_members.user_id, userId)))
    .limit(1);
  return row?.role === 'viewer';
}

/** Throws 403 read_only when `userId` is a viewer of this profile's account. Access itself is checked separately. */
export async function assertNotViewerOfProfile(userId: string, profileId: string): Promise<void> {
  if (await isViewerOfProfile(userId, profileId)) throw readOnlyError();
}

/** Same as `canAccessProfile`, then refuses viewers with 403 read_only. */
export async function assertCanWriteProfile(userId: string, profileId: string): Promise<void> {
  if (!(await canAccessProfile(userId, profileId))) throw new AppError(403, 'forbidden', 'Cannot access this profile');
  await assertNotViewerOfProfile(userId, profileId);
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

/** requireAccount, then refuses a viewer of that account with 403 read_only (uploads and other account writes). */
export async function requireAccountWriter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAccount(request, reply);
  const [m] = await db
    .select({ role: account_members.role })
    .from(account_members)
    .where(and(eq(account_members.account_id, request.accountId!), eq(account_members.user_id, request.user!.id)))
    .limit(1);
  if (m?.role === 'viewer') throw readOnlyError();
}
