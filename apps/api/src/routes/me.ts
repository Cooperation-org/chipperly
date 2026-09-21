import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { PinBodySchema, type ExportResponse, type MeAccount, type MeResponse } from '@chipperly/shared/schemas/auth';
import { RegisterPushTokenBodySchema, UnregisterPushTokenBodySchema } from '@chipperly/shared/schemas/push';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { db, sql } from '../db/client.js';
import { env } from '../env.js';
import { account_members, accounts, invites, sessions, users } from '../db/schema/accounts.js';
import { push_tokens } from '../db/schema/push.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { media } from '../db/schema/media.js';
import { hashPin, verifyPin } from '../lib/password.js';
import { canAccessProfile, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { normalizeRow } from './sync.js';

const LockBodySchema = z.object({ profile_id: uuidSchema });

export default async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireUser }, async (request): Promise<MeResponse> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        pin_hash: users.pin_hash,
        email_verified_at: users.email_verified_at,
        created_at: users.created_at,
        auth_provider: users.auth_provider,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const user: UserPublic = userRow;

    const memberships = await db.select().from(account_members).where(eq(account_members.user_id, userId));
    const accountIds = memberships.map((m) => m.account_id);
    const accountRows =
      accountIds.length > 0 ? await db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];
    const roleByAccountId = new Map(memberships.map((m) => [m.account_id, m.role]));
    const meAccounts: MeAccount[] = accountRows.map((account) => ({
      account,
      role: roleByAccountId.get(account.id) ?? 'member',
    }));

    const adminAccountIds = memberships.filter((m) => m.role === 'admin').map((m) => m.account_id);
    const adminProfiles =
      adminAccountIds.length > 0
        ? await db
            .select()
            .from(profiles)
            .where(and(inArray(profiles.account_id, adminAccountIds), isNull(profiles.deleted_at)))
        : [];
    const memberProfileRows = await db
      .select({ profile: profiles })
      .from(profile_members)
      .innerJoin(profiles, eq(profile_members.profile_id, profiles.id))
      .where(and(eq(profile_members.user_id, userId), isNull(profiles.deleted_at)));

    const profileById = new Map<string, Profile>();
    for (const profile of adminProfiles) profileById.set(profile.id, profile);
    for (const { profile } of memberProfileRows) profileById.set(profile.id, profile);

    return {
      user,
      accounts: meAccounts,
      profiles: [...profileById.values()],
    };
  });

  /** S30 "Download my data" (SOW Q21): every record the signed-in user can see, as one JSON file. */
  app.get('/me/export', { preHandler: requireUser }, async (request): Promise<ExportResponse> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        email_verified_at: users.email_verified_at,
        created_at: users.created_at,
        auth_provider: users.auth_provider,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const memberships = await db.select().from(account_members).where(eq(account_members.user_id, userId));
    const accountIds = memberships.map((m) => m.account_id);
    const accountRows =
      accountIds.length > 0 ? await db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];

    const adminAccountIds = memberships.filter((m) => m.role === 'admin').map((m) => m.account_id);
    const adminProfiles =
      adminAccountIds.length > 0
        ? await db
            .select()
            .from(profiles)
            .where(and(inArray(profiles.account_id, adminAccountIds), isNull(profiles.deleted_at)))
        : [];
    const memberProfileRows = await db
      .select({ profile: profiles })
      .from(profile_members)
      .innerJoin(profiles, eq(profile_members.profile_id, profiles.id))
      .where(and(eq(profile_members.user_id, userId), isNull(profiles.deleted_at)));

    const profileById = new Map<string, Profile>();
    for (const profile of adminProfiles) profileById.set(profile.id, profile);
    for (const { profile } of memberProfileRows) profileById.set(profile.id, profile);
    const exportProfiles = [...profileById.values()];

    // ponytail: tombstoned (deleted_at set) rows are left out — a parent asking
    // "what do you have on my child" wants what's live, not what they already
    // deleted. Same 12-table list and per-profile_id read as routes/sync.ts's
    // pull, just unfiltered by version and read once instead of paginated.
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of TABLE_NAMES) tables[table] = [];
    for (const profile of exportProfiles) {
      for (const table of TABLE_NAMES) {
        // eslint-disable-next-line no-await-in-loop -- export-only, small N; not worth parallelizing.
        const rows = await sql`select * from ${sql(table)} where profile_id = ${profile.id} and deleted_at is null`;
        for (const row of rows) tables[table].push(normalizeRow(row));
      }
    }

    const mediaRows =
      accountIds.length > 0 ? await db.select().from(media).where(inArray(media.account_id, accountIds)) : [];

    return {
      exported_at: Date.now(),
      user: userRow,
      accounts: accountRows,
      memberships: memberships.map((m) => ({ account_id: m.account_id, role: m.role })),
      profiles: exportProfiles,
      tables,
      media: mediaRows.map((m) => ({
        id: m.id,
        url: `${env.BASE_PATH}/api/media/${m.id}`,
        kind: m.kind,
        created_at: m.created_at,
      })),
    };
  });

  app.patch('/me/pin', { preHandler: requireUser }, async (request): Promise<{ pin_hash: string }> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const body = PinBodySchema.parse(request.body);
    const pinHash = await hashPin(body.pin);
    await db.update(users).set({ pin_hash: pinHash }).where(eq(users.id, authUser.id));

    return { pin_hash: pinHash };
  });

  /** Registers/refreshes this device's push token. Insert-or-ignore: a re-registration of the same (user, token) pair is a no-op, not an error. */
  app.put('/me/push-token', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const body = RegisterPushTokenBodySchema.parse(request.body);
    await db
      .insert(push_tokens)
      .values({ user_id: authUser.id, token: body.token, platform: body.platform, created_at: Date.now() })
      .onConflictDoNothing();
    return { ok: true };
  });

  /** Called on sign-out/unregister so a stale token isn't pushed to after the device stops wanting it. */
  app.delete('/me/push-token', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const body = UnregisterPushTokenBodySchema.parse(request.body);
    await db.delete(push_tokens).where(and(eq(push_tokens.user_id, authUser.id), eq(push_tokens.token, body.token)));
    return { ok: true };
  });

  /** S23 "Lock this device": marks this session child-locked. No PIN needed to lock, only to unlock. */
  app.post('/me/lock', { preHandler: requireUser }, async (request): Promise<{ locked_profile_id: string }> => {
    const authUser = request.user!;
    const body = LockBodySchema.parse(request.body);

    const allowed = await canAccessProfile(authUser.id, body.profile_id);
    if (!allowed) throw new AppError(403, 'forbidden', 'Cannot lock to this profile');

    await db.update(sessions).set({ locked_profile_id: body.profile_id }).where(eq(sessions.id, authUser.session_id));
    return { locked_profile_id: body.profile_id };
  });

  /** S24 unlock overlay: clears this session's lock, but only once the PIN checks out server-side. */
  app.post('/me/unlock', { preHandler: requireUser }, async (request): Promise<{ locked_profile_id: null }> => {
    const authUser = request.user!;
    const body = PinBodySchema.parse(request.body);

    const [userRow] = await db.select({ pin_hash: users.pin_hash }).from(users).where(eq(users.id, authUser.id)).limit(1);
    if (!userRow?.pin_hash || !(await verifyPin(body.pin, userRow.pin_hash))) {
      throw new AppError(401, 'invalid_pin', 'Wrong PIN');
    }

    await db.update(sessions).set({ locked_profile_id: null }).where(eq(sessions.id, authUser.session_id));
    return { locked_profile_id: null };
  });

  app.delete('/me', { preHandler: requireUser }, async (request, reply) => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    await db.transaction(async (tx) => {
      /** Deletes an account and everything under it: profiles, every profile-scoped row, invites, media. */
      async function deleteAccountCascade(accountId: string): Promise<void> {
        const profileIds = (
          await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId))
        ).map((r) => r.id);

        if (profileIds.length > 0) {
          await tx.delete(step_completions).where(inArray(step_completions.profile_id, profileIds));
          await tx.delete(chip_ledger).where(inArray(chip_ledger.profile_id, profileIds));
          await tx.delete(attitude_checks).where(inArray(attitude_checks.profile_id, profileIds));
          await tx.delete(schedule_items).where(inArray(schedule_items.profile_id, profileIds));
          await tx.delete(recurrence_skips).where(inArray(recurrence_skips.profile_id, profileIds));
          await tx.delete(activity_steps).where(inArray(activity_steps.profile_id, profileIds));
          await tx.delete(activities).where(inArray(activities.profile_id, profileIds));
          await tx.delete(story_pages).where(inArray(story_pages.profile_id, profileIds));
          await tx.delete(social_stories).where(inArray(social_stories.profile_id, profileIds));
          await tx.delete(rewards).where(inArray(rewards.profile_id, profileIds));
          await tx.delete(locations).where(inArray(locations.profile_id, profileIds));
          await tx.delete(profile_members).where(inArray(profile_members.profile_id, profileIds));
        }
        await tx.delete(profiles).where(eq(profiles.account_id, accountId));
        await tx.delete(invites).where(eq(invites.account_id, accountId));
        await tx.delete(media).where(eq(media.account_id, accountId));
        await tx.delete(account_members).where(eq(account_members.account_id, accountId));
        await tx.delete(accounts).where(eq(accounts.id, accountId));
      }

      const memberships = await tx.select().from(account_members).where(eq(account_members.user_id, userId));

      for (const membership of memberships) {
        const accountId = membership.account_id;
        const allMembers = await tx.select().from(account_members).where(eq(account_members.account_id, accountId));

        if (allMembers.length === 1) {
          await deleteAccountCascade(accountId);
          continue;
        }

        if (membership.role === 'admin') {
          const otherAdmin = allMembers.some((m) => m.user_id !== userId && m.role === 'admin');
          if (!otherAdmin) {
            throw new AppError(409, 'last_admin', 'Promote another member to admin before deleting your account');
          }
        }

        // Other people still use this account: just leave it, don't touch its data.
        // ponytail: unlike DELETE /accounts/:id/members/:user_id, this doesn't reassign
        // updated_by/created_by rows to another member; nothing reads those back against
        // `users`, and the account isn't this user's to keep tidy for others on their way out.
        const profileIds = (
          await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId))
        ).map((r) => r.id);
        if (profileIds.length > 0) {
          await tx
            .delete(profile_members)
            .where(and(eq(profile_members.user_id, userId), inArray(profile_members.profile_id, profileIds)));
        }
        await tx
          .delete(account_members)
          .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, userId)));
      }

      await tx
        .update(sessions)
        .set({ revoked_at: Date.now() })
        .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)));
      await tx.delete(users).where(eq(users.id, userId));
    });

    return reply.code(204).send();
  });
}
