import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import {
  BulkPersonSchema,
  BulkProfilesBodySchema,
  CreateClusterBodySchema,
  RosterQuerySchema,
  SetMemberGroupsBodySchema,
  UpdateClusterBodySchema,
  UpdateOrgBodySchema,
  UpdateOrgProfileBodySchema,
  type BulkProfilesResponse,
  type Cluster as ClusterWithStaff,
  type RosterPerson,
} from '@chipperly/shared/schemas/org';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { cluster_members, clusters } from '../db/schema/clusters.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { readOnlyError, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { assertCanCreate } from '../lib/trial.js';
import { offerHandoversForProfile } from '../lib/familyHandover.js';
import { notifyIfOverSeats, seatLimitFor, seatsUsed } from '../lib/orgSeats.js';
import { allLiveGroups, moderatorCanManage, moderatorScope, setGroups, visibleProfileIds as visibleIdsOf } from '../lib/groupAccess.js';
import { getMembership, insertProfile, issueInvite, requireAdmin, requireMember } from './accounts.js';

const idParamSchema = z.object({ id: uuidSchema });
const clusterParamSchema = z.object({ id: uuidSchema, cid: uuidSchema });
const profileParamSchema = z.object({ id: uuidSchema, pid: uuidSchema });

/** 409 not_an_org unless the account is an organization. Callers check membership first, so a stranger gets 403, not this. */
async function assertOrg(accountId: string): Promise<void> {
  const [account] = await db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw new AppError(404, 'not_found', 'Account not found');
  if (account.kind !== 'agency') throw new AppError(409, 'not_an_org', 'This is not an organization account');
}

async function orgMember(accountId: string, userId: string) {
  const membership = await requireMember(accountId, userId);
  await assertOrg(accountId);
  return membership;
}

async function orgAdmin(accountId: string, userId: string): Promise<void> {
  await requireMember(accountId, userId);
  await assertOrg(accountId);
  await requireAdmin(accountId, userId);
}

/** Admin or moderator of an organization. A viewer gets read_only, Staff get 403. Moderators are limited to their groups by the callers. */
async function orgManager(accountId: string, userId: string) {
  const membership = await requireMember(accountId, userId);
  await assertOrg(accountId);
  if (membership.role === 'viewer') throw readOnlyError();
  if (membership.role !== 'admin' && membership.role !== 'moderator') throw new AppError(403, 'forbidden', 'Admin role required');
  return membership;
}

/**
 * Profile ids a non-admin may see: their assignments plus everyone in their groups; null for an admin,
 * who sees everyone. A moderator also gets archived people in their groups, so they can restore them.
 */
async function visibleProfileIds(accountId: string, role: string, userId: string): Promise<string[] | null> {
  if (role === 'admin') return null;
  return visibleIdsOf(accountId, userId, { archivedGroupPeople: role === 'moderator' });
}

const alive = isNull(profiles.deleted_at);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** A live cluster in this account already has this name (any case), other than `exceptId`. */
async function clusterNameTaken(accountId: string, name: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(and(eq(clusters.account_id, accountId), isNull(clusters.archived_at), sql`lower(${clusters.name}) = lower(${name})`));
  return rows.some((r) => r.id !== exceptId);
}

async function getCluster(accountId: string, clusterId: string) {
  const [row] = await db
    .select()
    .from(clusters)
    .where(and(eq(clusters.id, clusterId), eq(clusters.account_id, accountId)))
    .limit(1);
  if (!row) throw new AppError(404, 'not_found', 'Cluster not found');
  return row;
}

async function peopleIn(clusterId: string): Promise<number> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.cluster_id, clusterId), alive, isNull(profiles.archived_at)));
  return rows.length;
}

const ROW_MESSAGES: Record<string, string> = {
  name: 'Name is missing or too long',
  cluster_id: 'Cluster is not valid',
  cluster_name: 'Cluster name is too long',
  parent_email: 'Parent email is not valid',
};

export default async function orgRoutes(app: FastifyInstance): Promise<void> {
  app.patch('/accounts/:id/org', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const body = UpdateOrgBodySchema.parse(request.body);
    await orgAdmin(accountId, request.user!.id);

    const patch: Partial<typeof accounts.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.org_type !== undefined) patch.org_type = body.org_type;
    if (body.org_size_estimate !== undefined) patch.org_size_estimate = body.org_size_estimate;
    if (Object.keys(patch).length === 0) throw new AppError(400, 'nothing_to_update', 'Nothing to update');
    const [account] = await db.update(accounts).set(patch).where(eq(accounts.id, accountId)).returning();
    return { account: account! };
  });

  app.get('/accounts/:id/clusters', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const membership = await orgMember(accountId, request.user!.id);
    const userId = request.user!.id;
    const visible = await visibleProfileIds(accountId, membership.role, userId);

    const people = await db
      .select({ cluster_id: profiles.cluster_id })
      .from(profiles)
      .where(and(eq(profiles.account_id, accountId), alive, isNull(profiles.archived_at), isNotNull(profiles.cluster_id), visible ? inArray(profiles.id, visible) : undefined));
    const counts = new Map<string, number>();
    for (const p of people) counts.set(p.cluster_id!, (counts.get(p.cluster_id!) ?? 0) + 1);

    const rows = await db.select().from(clusters).where(eq(clusters.account_id, accountId)).orderBy(asc(sql`lower(${clusters.name})`));
    // Everyone but an admin only hears about their own groups and the clusters their own people are in.
    const mine = visible ? new Set((await db.select({ id: cluster_members.cluster_id }).from(cluster_members).where(and(eq(cluster_members.user_id, userId), eq(cluster_members.account_id, accountId)))).map((r) => r.id)) : null;
    // A moderator only hears about their own groups; Staff and Family also see the clusters their people are in.
    const shown = !visible ? rows : membership.role === 'moderator' ? rows.filter((c) => mine?.has(c.id)) : rows.filter((c) => counts.has(c.id) || mine?.has(c.id));

    // Admins and moderators also see who is assigned to each group they can see.
    const staff = new Map<string, NonNullable<ClusterWithStaff['staff']>>();
    if (!visible || membership.role === 'moderator') {
      const links = await db
        .select({ cluster_id: cluster_members.cluster_id, user_id: users.id, display_name: users.display_name, role: account_members.role })
        .from(cluster_members)
        .innerJoin(account_members, and(eq(account_members.user_id, cluster_members.user_id), eq(account_members.account_id, accountId)))
        .innerJoin(users, eq(users.id, cluster_members.user_id))
        .where(eq(cluster_members.account_id, accountId))
        .orderBy(asc(users.display_name));
      for (const l of links) staff.set(l.cluster_id, [...(staff.get(l.cluster_id) ?? []), { user_id: l.user_id, display_name: l.display_name, role: l.role }]);
    }
    return {
      clusters: shown.map((c) => ({
        id: c.id,
        name: c.name,
        archived_at: c.archived_at,
        profile_count: counts.get(c.id) ?? 0,
        ...(!visible || membership.role === 'moderator' ? { staff: staff.get(c.id) ?? [] } : {}),
      })),
    };
  });

  app.post('/accounts/:id/clusters', { preHandler: requireUser }, async (request, reply) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const body = CreateClusterBodySchema.parse(request.body);
    await orgAdmin(accountId, request.user!.id);
    if (await clusterNameTaken(accountId, body.name)) throw new AppError(409, 'cluster_exists', 'A cluster with that name already exists');

    try {
      const [row] = await db.insert(clusters).values({ id: uuidv7(), account_id: accountId, name: body.name, archived_at: null, created_at: Date.now() }).returning();
      reply.code(201);
      return { id: row!.id, name: row!.name, archived_at: null, profile_count: 0 };
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError(409, 'cluster_exists', 'A cluster with that name already exists');
      throw err;
    }
  });

  app.patch('/accounts/:id/clusters/:cid', { preHandler: requireUser }, async (request) => {
    const { id: accountId, cid } = clusterParamSchema.parse(request.params);
    const body = UpdateClusterBodySchema.parse(request.body);
    await orgAdmin(accountId, request.user!.id);
    const cluster = await getCluster(accountId, cid);

    const name = body.name ?? cluster.name;
    const willBeArchived = body.archived === undefined ? cluster.archived_at !== null : body.archived;
    if (!willBeArchived && (await clusterNameTaken(accountId, name, cid))) {
      throw new AppError(409, 'cluster_exists', 'A cluster with that name already exists');
    }
    if (body.archived === true && cluster.archived_at === null && (await peopleIn(cid)) > 0) {
      throw new AppError(409, 'cluster_not_empty', 'Move or archive the people in this cluster first');
    }

    const patch: Partial<typeof clusters.$inferInsert> = { name };
    if (body.archived !== undefined && willBeArchived !== (cluster.archived_at !== null)) patch.archived_at = willBeArchived ? Date.now() : null;
    try {
      const [row] = await db.update(clusters).set(patch).where(eq(clusters.id, cid)).returning();
      return { id: row!.id, name: row!.name, archived_at: row!.archived_at, profile_count: row!.archived_at ? 0 : await peopleIn(cid) };
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError(409, 'cluster_exists', 'A cluster with that name already exists');
      throw err;
    }
  });

  app.get('/accounts/:id/roster', { preHandler: requireUser }, async (request): Promise<{ people: RosterPerson[]; seats: { used: number; limit: number | null } }> => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const query = RosterQuerySchema.parse(request.query);
    const userId = request.user!.id;
    const membership = await orgMember(accountId, userId);
    const visible = await visibleProfileIds(accountId, membership.role, userId);

    const where: (SQL | undefined)[] = [eq(profiles.account_id, accountId), alive];
    if (visible) where.push(inArray(profiles.id, visible.length > 0 ? visible : [uuidv7()]));
    if (query.status === 'active') where.push(isNull(profiles.archived_at));
    if (query.status === 'archived') where.push(isNotNull(profiles.archived_at));
    if (query.cluster_id === 'none') where.push(isNull(profiles.cluster_id));
    else if (query.cluster_id) where.push(eq(profiles.cluster_id, query.cluster_id));
    if (query.q) where.push(sql`${profiles.name} ilike ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`}`);

    const rows = await db
      .select()
      .from(profiles)
      .where(and(...where))
      .orderBy(asc(sql`lower(${profiles.name})`), asc(profiles.id));

    const team = new Map<string, RosterPerson['team']>();
    if (rows.length > 0) {
      const links = await db
        .select({ profile_id: profile_members.profile_id, user_id: users.id, display_name: users.display_name, role: account_members.role })
        .from(profile_members)
        .innerJoin(account_members, and(eq(account_members.user_id, profile_members.user_id), eq(account_members.account_id, accountId)))
        .innerJoin(users, eq(users.id, profile_members.user_id))
        .where(inArray(profile_members.profile_id, rows.map((r) => r.id)))
        .orderBy(asc(users.display_name));
      // Staff assigned to a person's group are part of that person's team too.
      const clusterIds = [...new Set(rows.map((r) => r.cluster_id).filter((c): c is string => c !== null))];
      const groupLinks =
        clusterIds.length === 0
          ? []
          : await db
              .select({ cluster_id: cluster_members.cluster_id, user_id: users.id, display_name: users.display_name, role: account_members.role })
              .from(cluster_members)
              .innerJoin(account_members, and(eq(account_members.user_id, cluster_members.user_id), eq(account_members.account_id, accountId)))
              .innerJoin(users, eq(users.id, cluster_members.user_id))
              .where(inArray(cluster_members.cluster_id, clusterIds))
              .orderBy(asc(users.display_name));
      const all = [
        ...links,
        ...rows.flatMap((r) => groupLinks.filter((g) => g.cluster_id === r.cluster_id).map((g) => ({ profile_id: r.id, user_id: g.user_id, display_name: g.display_name, role: g.role }))),
      ];
      const seen = new Set<string>();
      for (const l of all) {
        // Admins and moderators see everyone on the team. Anyone else sees staff and themselves, not other families.
        if (membership.role !== 'admin' && membership.role !== 'moderator' && l.role === 'viewer' && l.user_id !== userId) continue;
        const key = `${l.profile_id}:${l.user_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const list = team.get(l.profile_id) ?? [];
        list.push({ user_id: l.user_id, display_name: l.display_name, role: l.role });
        team.set(l.profile_id, list);
      }
    }

    return {
      people: rows.map((p) => ({
        profile_id: p.id,
        name: p.name,
        emoji: p.avatar_emoji,
        photo_id: p.avatar_photo_id,
        cluster_id: p.cluster_id,
        archived_at: p.archived_at,
        team: team.get(p.id) ?? [],
      })),
      seats: { used: await seatsUsed(accountId), limit: await seatLimitFor(accountId) },
    };
  });

  app.post('/accounts/:id/profiles/bulk', { preHandler: requireUser }, async (request, reply): Promise<BulkProfilesResponse> => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const body = BulkProfilesBodySchema.parse(request.body);
    const userId = request.user!.id;
    await orgAdmin(accountId, userId);
    await assertCanCreate(accountId);

    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const [inviter] = await db.select({ display_name: users.display_name }).from(users).where(eq(users.id, userId)).limit(1);
    const limit = await seatLimitFor(accountId);
    const usedBefore = await seatsUsed(accountId);

    const live = await db.select({ id: clusters.id, name: clusters.name }).from(clusters).where(and(eq(clusters.account_id, accountId), isNull(clusters.archived_at)));
    const byName = new Map(live.map((c) => [c.name.toLowerCase(), c.id]));
    const liveIds = new Set(live.map((c) => c.id));

    const created: BulkProfilesResponse['created'] = [];
    const errors: BulkProfilesResponse['errors'] = [];
    const parents = new Map<string, { row: number; profileIds: string[] }>();

    for (const [index, raw] of body.people.entries()) {
      const row = index + 1;
      const parsed = BulkPersonSchema.safeParse(raw);
      if (!parsed.success) {
        const field = String(parsed.error.issues[0]?.path[0] ?? '');
        errors.push({ row, message: ROW_MESSAGES[field] ?? 'This row is not valid' });
        continue;
      }
      const person = parsed.data;
      try {
        let clusterId: string | null = null;
        if (person.cluster_id) {
          if (!liveIds.has(person.cluster_id)) {
            errors.push({ row, message: 'Cluster not found' });
            continue;
          }
          clusterId = person.cluster_id;
        } else if (person.cluster_name) {
          const key = person.cluster_name.toLowerCase();
          clusterId = byName.get(key) ?? null;
          if (!clusterId) {
            clusterId = uuidv7();
            await db.insert(clusters).values({ id: clusterId, account_id: accountId, name: person.cluster_name, archived_at: null, created_at: Date.now() });
            byName.set(key, clusterId);
            liveIds.add(clusterId);
          }
        }
        const profile = await insertProfile(accountId, userId, { name: person.name, emoji: person.emoji, photo_id: person.photo_id }, clusterId);
        created.push({ profile_id: profile.id, name: profile.name });
        if (person.parent_email) {
          const email = person.parent_email.toLowerCase();
          const entry = parents.get(email) ?? { row, profileIds: [] };
          entry.profileIds.push(profile.id);
          parents.set(email, entry);
        }
      } catch (err) {
        request.log.error(err);
        errors.push({ row, message: 'Could not add this person' });
      }
    }

    // One invite per parent email, covering all of their children in this upload.
    let invitesSent = 0;
    for (const [email, entry] of parents) {
      try {
        await issueInvite({
          accountId,
          accountName: account!.name,
          inviterId: userId,
          inviterName: inviter?.display_name ?? 'A team member',
          email,
          role: 'viewer',
          profileIds: entry.profileIds,
          request,
        });
        invitesSent++;
      } catch (err) {
        request.log.error(err);
        errors.push({ row: entry.row, message: `Could not send an invite to ${email}` });
      }
    }
    errors.sort((a, b) => a.row - b.row);

    const used = usedBefore + created.length;
    await notifyIfOverSeats(accountId, usedBefore, used, limit);

    reply.code(201);
    return { created, invites_sent: invitesSent, errors, seats: { used, limit, over: limit !== null && used > limit } };
  });

  app.patch('/accounts/:id/profiles/:pid', { preHandler: requireUser }, async (request) => {
    const { id: accountId, pid } = profileParamSchema.parse(request.params);
    const body = UpdateOrgProfileBodySchema.parse(request.body);
    const userId = request.user!.id;
    const caller = await orgManager(accountId, userId);

    const [profile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, pid), eq(profiles.account_id, accountId), alive))
      .limit(1);
    if (!profile) throw new AppError(404, 'not_found', 'Person not found');
    if (caller.role === 'moderator') {
      // A moderator works inside their own groups: the person must be in one, and can only move to another.
      const scope = await moderatorScope(accountId, userId);
      if (!profile.cluster_id || !scope.groups.has(profile.cluster_id)) throw new AppError(404, 'not_found', 'Person not found');
      if (body.cluster_id !== undefined && (body.cluster_id === null || !scope.groups.has(body.cluster_id))) {
        throw new AppError(403, 'forbidden', 'You can only move people between your own groups');
      }
    }

    const patch: Partial<typeof profiles.$inferInsert> = {};
    if (body.cluster_id !== undefined) {
      if (body.cluster_id !== null) {
        const cluster = await getCluster(accountId, body.cluster_id);
        if (cluster.archived_at !== null) throw new AppError(409, 'cluster_archived', 'That cluster is archived');
      }
      patch.cluster_id = body.cluster_id;
    }
    if (body.archived !== undefined) {
      patch.archived_at = body.archived ? (profile.archived_at ?? Date.now()) : null;
      if (!body.archived && body.cluster_id === undefined && profile.cluster_id) {
        // Coming back into a cluster that has since been archived: leave them unassigned instead.
        const [cluster] = await db.select({ archived_at: clusters.archived_at }).from(clusters).where(eq(clusters.id, profile.cluster_id)).limit(1);
        if (!cluster || cluster.archived_at !== null) patch.cluster_id = null;
      }
    }
    if (Object.keys(patch).length === 0) throw new AppError(400, 'nothing_to_update', 'Nothing to update');

    const before = await seatsUsed(accountId);
    const [row] = await db
      .update(profiles)
      .set({ ...patch, client_updated_at: Date.now(), updated_by: userId })
      .where(eq(profiles.id, pid))
      .returning();
    if (body.archived === false && profile.archived_at !== null) {
      await notifyIfOverSeats(accountId, before, before + 1, await seatLimitFor(accountId));
    }
    // The org stopped covering this person: their family may keep a copy.
    if (body.archived === true && profile.archived_at === null) {
      await offerHandoversForProfile(pid, 'archived').catch((err: unknown) => request.log.error(err));
    }
    return row!;
  });

  /** Replaces the groups a person is assigned to. Admin: anyone but another admin. Moderator: Staff and Family inside their own groups. */
  app.put('/accounts/:id/members/:user_id/groups', { preHandler: requireUser }, async (request) => {
    const { id: accountId } = idParamSchema.parse(request.params);
    const { user_id: targetId } = z.object({ user_id: uuidSchema }).parse(request.params);
    const body = SetMemberGroupsBodySchema.parse(request.body);
    const userId = request.user!.id;
    const caller = await orgManager(accountId, userId);

    const target = await getMembership(accountId, targetId);
    if (!target) throw new AppError(404, 'not_found', 'Member not found');
    if (caller.role === 'moderator' && !(await moderatorCanManage(accountId, userId, targetId))) {
      throw new AppError(403, 'forbidden', 'That person is outside your groups');
    }
    if (target.role === 'admin') throw new AppError(409, 'admin_sees_all', 'Admins see every group');
    const clusterIds = [...new Set(body.cluster_ids)];
    if (!(await allLiveGroups(accountId, clusterIds))) throw new AppError(400, 'invalid_groups', 'Some of those groups are not in this account');
    if (caller.role === 'moderator') {
      const scope = await moderatorScope(accountId, userId);
      if (clusterIds.some((id) => !scope.groups.has(id))) throw new AppError(403, 'forbidden', 'Those groups are not yours');
    }

    await db.transaction((tx) => setGroups(tx, accountId, targetId, clusterIds));
    return { user_id: targetId, cluster_ids: clusterIds };
  });
}
