import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import {
  AcceptInviteResponseSchema,
  InviteDetailsSchema,
  UpdateMemberBodySchema,
  type AccountMember,
  type InvitePublic,
} from '@chipperly/shared/schemas/account';
import { CreateAccountBodySchema, CreateProfileBodySchema, InviteBodySchema } from '@chipperly/shared/schemas/auth';
import { LocationChangedBodySchema } from '@chipperly/shared/schemas/push';
import { PROFILE_LIMITS } from '@chipperly/shared/constants/limits';
import { db } from '../db/client.js';
import { push_tokens } from '../db/schema/push.js';
import { account_members, accounts, invites, users } from '../db/schema/accounts.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { requireUser, canAccessProfile } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { linkBase } from '../lib/links.js';
import { sendMail } from '../lib/mailer.js';
import { sendPush } from '../lib/push.js';
import { seedProfile } from '../seed/seedProfile.js';
import { env } from '../env.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const idParamSchema = z.object({ id: uuidSchema });

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

async function getMembership(accountId: string, userId: string) {
  const [row] = await db
    .select()
    .from(account_members)
    .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, userId)))
    .limit(1);
  return row ?? null;
}

async function requireMember(accountId: string, userId: string) {
  const membership = await getMembership(accountId, userId);
  if (!membership) throw new AppError(403, 'forbidden', 'Not a member of this account');
  return membership;
}

async function requireAdmin(accountId: string, userId: string) {
  const membership = await requireMember(accountId, userId);
  if (membership.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin role required');
  return membership;
}

/** Every profile id in this account, regardless of `deleted_at` (removed-member reassignment must reach them all). */
async function accountProfileIds(accountId: string): Promise<string[]> {
  const rows = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId));
  return rows.map((r) => r.id);
}

function toInvitePublic(row: typeof invites.$inferSelect): InvitePublic {
  const { token_hash: _token_hash, ...rest } = row;
  return rest;
}

/** Mails the accept link and returns it, so the caller can also hand it to the admin (InviteIssuedSchema). */
async function sendInviteEmail(params: {
  to: string;
  rawToken: string;
  accountName: string;
  inviterName: string;
  request: FastifyRequest;
}): Promise<string> {
  const link = `${linkBase(params.request)}/invite/?token=${params.rawToken}`;
  await sendMail({
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.accountName} on Chipperly`,
    text: `${params.inviterName} invited you to join ${params.accountName} on Chipperly.\n\nAccept the invite: ${link}\n\nThis link expires in 7 days.`,
  });
  return link;
}

export default async function accountsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/accounts', { preHandler: requireUser }, async (request, reply) => {
    const body = CreateAccountBodySchema.parse(request.body);
    const userId = request.user!.id;

    const accountId = uuidv7();
    const [account] = await db
      .insert(accounts)
      .values({ id: accountId, kind: body.kind, name: body.name, created_at: Date.now(), owner_user_id: userId })
      .returning();
    await db.insert(account_members).values({ account_id: accountId, user_id: userId, role: 'admin' });

    reply.code(201);
    return { account: account!, role: 'admin' as const };
  });

  app.get('/accounts/:id/profiles', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const userId = request.user!.id;
    const membership = await requireMember(accountId, userId);

    if (membership.role === 'admin') {
      return db
        .select()
        .from(profiles)
        .where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at)));
    }

    const visibleIds = (
      await db.select({ profile_id: profile_members.profile_id }).from(profile_members).where(eq(profile_members.user_id, userId))
    ).map((r) => r.profile_id);
    if (visibleIds.length === 0) return [];

    return db
      .select()
      .from(profiles)
      .where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at), inArray(profiles.id, visibleIds)));
  });

  app.post('/accounts/:id/profiles', { preHandler: requireUser }, async (request, reply) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const body = CreateProfileBodySchema.parse(request.body);
    const userId = request.user!.id;
    await requireAdmin(accountId, userId);

    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) throw new AppError(404, 'not_found', 'Account not found');

    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at)));
    const limit = PROFILE_LIMITS[account.kind];
    if (existing.length >= limit) {
      throw new AppError(409, 'profile_limit', `This ${account.kind} account is limited to ${limit} profile${limit === 1 ? '' : 's'}`);
    }

    const now = Date.now();
    const profileId = uuidv7();
    const profile = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(profiles)
        .values({
          id: profileId,
          account_id: accountId,
          name: body.name,
          avatar_emoji: body.emoji ?? null,
          avatar_photo_id: body.photo_id ?? null,
          share_token: null,
          first_then_activity_id: null,
          first_then_reward_id: null,
          settings: {},
          client_updated_at: now,
          updated_by: userId,
          deleted_at: null,
        })
        .returning();
      await seedProfile(tx, profileId, userId);
      return row!;
    });

    reply.code(201);
    return profile;
  });

  app.post('/accounts/:id/invites', { preHandler: requireUser }, async (request, reply) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const body = InviteBodySchema.parse(request.body);
    const userId = request.user!.id;
    await requireAdmin(accountId, userId);

    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) throw new AppError(404, 'not_found', 'Account not found');
    const [inviter] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const rawToken = randomBytes(32).toString('base64url');
    const [invite] = await db
      .insert(invites)
      .values({
        id: uuidv7(),
        account_id: accountId,
        email: body.email.toLowerCase(),
        role: body.role,
        profile_ids: body.profile_ids,
        relationship_label: body.relationship_label ?? null,
        token_hash: hashToken(rawToken),
        expires_at: Date.now() + INVITE_TTL_MS,
        accepted_at: null,
        invited_by: userId,
      })
      .returning();

    const inviteUrl = await sendInviteEmail({
      to: invite!.email,
      rawToken,
      accountName: account.name,
      inviterName: inviter?.display_name ?? 'A caregiver',
      request,
    });

    reply.code(201);
    return { ...toInvitePublic(invite!), invite_url: inviteUrl, email_sent: env.mailEnabled };
  });

  app.post('/accounts/:id/invites/:inviteId/resend', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const { inviteId } = z.object({ inviteId: uuidSchema }).parse(request.params);
    const userId = request.user!.id;
    await requireAdmin(accountId, userId);

    const [existing] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.id, inviteId), eq(invites.account_id, accountId)))
      .limit(1);
    if (!existing) throw new AppError(404, 'not_found', 'Invite not found');

    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const rawToken = randomBytes(32).toString('base64url');
    const [invite] = await db
      .update(invites)
      .set({ token_hash: hashToken(rawToken), expires_at: Date.now() + INVITE_TTL_MS })
      .where(eq(invites.id, inviteId))
      .returning();

    const inviteUrl = await sendInviteEmail({
      to: invite!.email,
      rawToken,
      accountName: account?.name ?? '',
      inviterName: inviter?.display_name ?? 'A caregiver',
      request,
    });

    return { ...toInvitePublic(invite!), invite_url: inviteUrl, email_sent: env.mailEnabled };
  });

  app.delete('/accounts/:id/invites/:inviteId', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const { inviteId } = z.object({ inviteId: uuidSchema }).parse(request.params);
    const userId = request.user!.id;
    await requireAdmin(accountId, userId);

    await db.delete(invites).where(and(eq(invites.id, inviteId), eq(invites.account_id, accountId)));
    return { ok: true };
  });

  app.get('/accounts/:id/members', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const userId = request.user!.id;
    await requireMember(accountId, userId);

    const profileIds = await accountProfileIds(accountId);

    const memberships = await db
      .select({
        user_id: account_members.user_id,
        role: account_members.role,
        email: users.email,
        display_name: users.display_name,
      })
      .from(account_members)
      .innerJoin(users, eq(users.id, account_members.user_id))
      .where(eq(account_members.account_id, accountId));

    const members: AccountMember[] = [];
    for (const m of memberships) {
      let profiles: AccountMember['profiles'] = [];
      if (m.role === 'admin') {
        // Admins see every profile implicitly, with no profile_members row
        // (and no location assignment -- that's for non-admin care-team
        // members like a therapist, not the account's own admins).
        profiles = profileIds.map((profile_id) => ({
          profile_id,
          relationship_label: null,
          assigned_location_id: null,
          location_notify_mode: null,
        }));
      } else if (profileIds.length > 0) {
        profiles = (
          await db
            .select({
              profile_id: profile_members.profile_id,
              relationship_label: profile_members.relationship_label,
              assigned_location_id: profile_members.assigned_location_id,
              location_notify_mode: profile_members.location_notify_mode,
            })
            .from(profile_members)
            .where(and(eq(profile_members.user_id, m.user_id), inArray(profile_members.profile_id, profileIds)))
        );
      }
      members.push({ user: { id: m.user_id, email: m.email, display_name: m.display_name }, role: m.role, profiles });
    }

    const pending = await db
      .select()
      .from(invites)
      .where(and(eq(invites.account_id, accountId), isNull(invites.accepted_at)));

    return { members, invites: pending.map(toInvitePublic) };
  });

  app.get(
    '/invites/:token',
    {
      config: {
        rateLimit:
          process.env.TEST_ENDPOINTS === '1'
            ? { max: 1000, timeWindow: '1 minute' }
            : { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
      const [invite] = await db.select().from(invites).where(eq(invites.token_hash, hashToken(token))).limit(1);
      if (!invite) throw new AppError(404, 'not_found', 'Invite not found');

      const [account] = await db.select().from(accounts).where(eq(accounts.id, invite.account_id)).limit(1);
      const [inviter] = await db.select().from(users).where(eq(users.id, invite.invited_by)).limit(1);
      const profileRows =
        invite.profile_ids.length === 0
          ? []
          : await db
              .select({ id: profiles.id, name: profiles.name, avatar_emoji: profiles.avatar_emoji })
              .from(profiles)
              .where(inArray(profiles.id, invite.profile_ids));

      return InviteDetailsSchema.parse({
        account_name: account?.name ?? '',
        inviter_name: inviter?.display_name ?? '',
        role: invite.role,
        profiles: profileRows,
        email: invite.email,
        expired: Date.now() > invite.expires_at,
      });
    },
  );

  app.post('/invites/:token/accept', { preHandler: requireUser }, async (request) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const userId = request.user!.id;
    const [invite] = await db.select().from(invites).where(eq(invites.token_hash, hashToken(token))).limit(1);
    if (!invite) throw new AppError(404, 'not_found', 'Invite not found');
    if (Date.now() > invite.expires_at) throw new AppError(400, 'invite_expired', 'This invite has expired');

    await db.transaction(async (tx) => {
      const already = await getMembership(invite.account_id, userId);
      if (!already) {
        await tx.insert(account_members).values({ account_id: invite.account_id, user_id: userId, role: invite.role });
      }
      for (const profileId of invite.profile_ids) {
        await tx
          .insert(profile_members)
          .values({ profile_id: profileId, user_id: userId, relationship_label: invite.relationship_label })
          .onConflictDoNothing();
      }
      if (!invite.accepted_at) {
        await tx.update(invites).set({ accepted_at: Date.now() }).where(eq(invites.id, invite.id));
      }
    });

    return AcceptInviteResponseSchema.parse({ account_id: invite.account_id, profile_ids: invite.profile_ids });
  });

  app.patch('/accounts/:id/members/:user_id', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const { user_id: targetId } = z.object({ user_id: uuidSchema }).parse(request.params);
    const body = UpdateMemberBodySchema.parse(request.body);
    const callerId = request.user!.id;
    await requireAdmin(accountId, callerId);

    const target = await getMembership(accountId, targetId);
    if (!target) throw new AppError(404, 'not_found', 'Member not found');

    if (body.role && body.role !== 'admin' && target.role === 'admin') {
      const admins = await db
        .select()
        .from(account_members)
        .where(and(eq(account_members.account_id, accountId), eq(account_members.role, 'admin')));
      if (admins.length <= 1) throw new AppError(409, 'last_admin', 'An account needs at least one admin');
    }

    await db.transaction(async (tx) => {
      if (body.role) {
        await tx
          .update(account_members)
          .set({ role: body.role })
          .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, targetId)));
      }
      if (body.profile_ids) {
        const profileIds = await accountProfileIds(accountId);
        if (profileIds.length > 0) {
          await tx
            .delete(profile_members)
            .where(and(eq(profile_members.user_id, targetId), inArray(profile_members.profile_id, profileIds)));
        }
        for (const profileId of body.profile_ids) {
          await tx
            .insert(profile_members)
            .values({ profile_id: profileId, user_id: targetId, relationship_label: body.relationship_label ?? null })
            .onConflictDoNothing();
        }
      } else if (
        body.relationship_label !== undefined ||
        body.assigned_location_id !== undefined ||
        body.location_notify_mode !== undefined
      ) {
        const profileIds = await accountProfileIds(accountId);
        if (profileIds.length > 0) {
          const patch: Partial<typeof profile_members.$inferInsert> = {};
          if (body.relationship_label !== undefined) patch.relationship_label = body.relationship_label;
          if (body.assigned_location_id !== undefined) patch.assigned_location_id = body.assigned_location_id;
          if (body.location_notify_mode !== undefined) patch.location_notify_mode = body.location_notify_mode;
          await tx
            .update(profile_members)
            .set(patch)
            .where(and(eq(profile_members.user_id, targetId), inArray(profile_members.profile_id, profileIds)));
        }
      }
    });

    const [user] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    const [membership] = await db
      .select()
      .from(account_members)
      .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, targetId)))
      .limit(1);
    const profile_ids = (
      await db.select({ profile_id: profile_members.profile_id }).from(profile_members).where(eq(profile_members.user_id, targetId))
    ).map((r) => r.profile_id);

    return {
      user: { id: user!.id, email: user!.email, display_name: user!.display_name },
      role: membership!.role,
      profile_ids,
    };
  });

  app.delete('/accounts/:id/members/:user_id', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const { user_id: targetId } = z.object({ user_id: uuidSchema }).parse(request.params);
    const callerId = request.user!.id;
    await requireAdmin(accountId, callerId);

    const target = await getMembership(accountId, targetId);
    if (!target) throw new AppError(404, 'not_found', 'Member not found');

    if (target.role === 'admin') {
      const admins = await db
        .select()
        .from(account_members)
        .where(and(eq(account_members.account_id, accountId), eq(account_members.role, 'admin')));
      if (admins.length <= 1) throw new AppError(409, 'last_admin', 'An account needs at least one admin');
    }

    const profileIds = await accountProfileIds(accountId);

    await db.transaction(async (tx) => {
      if (profileIds.length > 0) {
        await tx
          .delete(profile_members)
          .where(and(eq(profile_members.user_id, targetId), inArray(profile_members.profile_id, profileIds)));
      }
      await tx
        .delete(account_members)
        .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, targetId)));

      // Reassign every profile-scoped row this user is credited with, in this account, to the caller.
      await tx.update(profiles).set({ updated_by: callerId }).where(and(eq(profiles.account_id, accountId), eq(profiles.updated_by, targetId)));
      if (profileIds.length > 0) {
        await tx.update(locations).set({ updated_by: callerId }).where(and(eq(locations.updated_by, targetId), inArray(locations.profile_id, profileIds)));
        await tx.update(activities).set({ updated_by: callerId }).where(and(eq(activities.updated_by, targetId), inArray(activities.profile_id, profileIds)));
        await tx
          .update(activity_steps)
          .set({ updated_by: callerId })
          .where(and(eq(activity_steps.updated_by, targetId), inArray(activity_steps.profile_id, profileIds)));
        await tx
          .update(recurrence_skips)
          .set({ updated_by: callerId })
          .where(and(eq(recurrence_skips.updated_by, targetId), inArray(recurrence_skips.profile_id, profileIds)));
        await tx.update(rewards).set({ updated_by: callerId }).where(and(eq(rewards.updated_by, targetId), inArray(rewards.profile_id, profileIds)));
        await tx
          .update(schedule_items)
          .set({ updated_by: callerId })
          .where(and(eq(schedule_items.updated_by, targetId), inArray(schedule_items.profile_id, profileIds)));
        await tx
          .update(schedule_items)
          .set({ completed_by: callerId })
          .where(and(eq(schedule_items.completed_by, targetId), inArray(schedule_items.profile_id, profileIds)));
        await tx
          .update(step_completions)
          .set({ updated_by: callerId })
          .where(and(eq(step_completions.updated_by, targetId), inArray(step_completions.profile_id, profileIds)));
        await tx
          .update(step_completions)
          .set({ completed_by: callerId })
          .where(and(eq(step_completions.completed_by, targetId), inArray(step_completions.profile_id, profileIds)));
        await tx
          .update(chip_ledger)
          .set({ updated_by: callerId })
          .where(and(eq(chip_ledger.updated_by, targetId), inArray(chip_ledger.profile_id, profileIds)));
        await tx
          .update(chip_ledger)
          .set({ created_by: callerId })
          .where(and(eq(chip_ledger.created_by, targetId), inArray(chip_ledger.profile_id, profileIds)));
        await tx
          .update(social_stories)
          .set({ updated_by: callerId })
          .where(and(eq(social_stories.updated_by, targetId), inArray(social_stories.profile_id, profileIds)));
        await tx
          .update(story_pages)
          .set({ updated_by: callerId })
          .where(and(eq(story_pages.updated_by, targetId), inArray(story_pages.profile_id, profileIds)));
        await tx
          .update(attitude_checks)
          .set({ updated_by: callerId })
          .where(and(eq(attitude_checks.updated_by, targetId), inArray(attitude_checks.profile_id, profileIds)));
        await tx
          .update(attitude_checks)
          .set({ created_by: callerId })
          .where(and(eq(attitude_checks.created_by, targetId), inArray(attitude_checks.profile_id, profileIds)));
      }
    });

    return { ok: true };
  });

  /**
   * Fans a push out to whichever care-team members care about this
   * profile's location. 'strict' only cares about their own assigned
   * location (arriving at it or leaving it); 'linked' cares about any
   * change. A member with no assignment at all is never notified.
   */
  app.post('/profiles/:id/location-changed', { preHandler: requireUser }, async (request): Promise<{ notified: number }> => {
    const { id: profileId } = idParamSchema.parse(request.params);
    const userId = request.user!.id;
    if (!(await canAccessProfile(userId, profileId))) throw new AppError(403, 'forbidden', 'Cannot access this profile');

    const body = LocationChangedBodySchema.parse(request.body);

    const [profile] = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
    if (!profile) throw new AppError(404, 'not_found', 'Profile not found');

    const newLocation = body.new_location_id
      ? (await db.select({ name: locations.name }).from(locations).where(eq(locations.id, body.new_location_id)).limit(1))[0]
      : undefined;

    const assignments = await db
      .select({ user_id: profile_members.user_id, assigned_location_id: profile_members.assigned_location_id, mode: profile_members.location_notify_mode })
      .from(profile_members)
      .where(and(eq(profile_members.profile_id, profileId), isNotNull(profile_members.assigned_location_id)));

    const recipientIds = assignments
      .filter((a) => {
        if (a.mode === 'linked') return true;
        return a.assigned_location_id === body.new_location_id || a.assigned_location_id === body.old_location_id;
      })
      .map((a) => a.user_id);

    if (recipientIds.length === 0) return { notified: 0 };

    const tokenRows = await db
      .select({ user_id: push_tokens.user_id, token: push_tokens.token })
      .from(push_tokens)
      .where(inArray(push_tokens.user_id, recipientIds));

    const messageBody = newLocation ? `${profile.name} is now at ${newLocation.name}.` : `${profile.name}'s location was cleared.`;
    const stale = await sendPush({
      tokens: tokenRows.map((r) => r.token),
      title: 'Chipperly',
      body: messageBody,
      data: { profile_id: profileId },
    });
    if (stale.length > 0) {
      await db.delete(push_tokens).where(inArray(push_tokens.token, stale));
    }

    return { notified: recipientIds.length };
  });
}
