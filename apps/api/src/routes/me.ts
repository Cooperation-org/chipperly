import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { PinBodySchema, type MeAccount, type MeResponse } from '@chipperly/shared/schemas/auth';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db } from '../db/client.js';
import { account_members, accounts, invites, sessions, users } from '../db/schema/accounts.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { media } from '../db/schema/media.js';
import { hashPin } from '../lib/password.js';
import { requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

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

  app.patch('/me/pin', { preHandler: requireUser }, async (request): Promise<{ pin_hash: string }> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const body = PinBodySchema.parse(request.body);
    const pinHash = await hashPin(body.pin);
    await db.update(users).set({ pin_hash: pinHash }).where(eq(users.id, authUser.id));

    return { pin_hash: pinHash };
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
