import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { account_members } from '../db/schema/accounts.js';
import { cluster_members, clusters } from '../db/schema/clusters.js';
import { profile_members, profiles } from '../db/schema/profiles.js';

/** Groups (live or not) this user is assigned to in the account. */
export async function groupIdsOf(userId: string, accountId: string): Promise<string[]> {
  const rows = await db
    .select({ id: cluster_members.cluster_id })
    .from(cluster_members)
    .where(and(eq(cluster_members.user_id, userId), eq(cluster_members.account_id, accountId)));
  return rows.map((r) => r.id);
}

/**
 * Profile ids a non-admin may see in one account: the people assigned to them directly, plus every
 * person in a group they are assigned to. Group people who are archived are left out unless
 * `archivedGroupPeople` (moderators need them to restore). Deleted people are always left out.
 * Admins see everyone: callers skip this for them.
 */
export async function visibleProfileIds(accountId: string, userId: string, opts: { archivedGroupPeople?: boolean } = {}): Promise<string[]> {
  const groups = await groupIdsOf(userId, accountId);
  const direct = await db
    .select({ id: profile_members.profile_id })
    .from(profile_members)
    .innerJoin(profiles, eq(profiles.id, profile_members.profile_id))
    .where(and(eq(profile_members.user_id, userId), eq(profiles.account_id, accountId), isNull(profiles.deleted_at)));
  const ids = new Set(direct.map((r) => r.id));
  if (groups.length > 0) {
    const inGroups = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.account_id, accountId),
          isNull(profiles.deleted_at),
          inArray(profiles.cluster_id, groups),
          opts.archivedGroupPeople ? undefined : isNull(profiles.archived_at),
        ),
      );
    for (const r of inGroups) ids.add(r.id);
  }
  return [...ids];
}

/** What a moderator covers: their groups, and every person in those groups (archived too) or assigned to them directly. */
export async function moderatorScope(accountId: string, moderatorId: string): Promise<{ groups: Set<string>; profiles: Set<string> }> {
  const groups = new Set(await groupIdsOf(moderatorId, accountId));
  const ids = await visibleProfileIds(accountId, moderatorId, { archivedGroupPeople: true });
  return { groups, profiles: new Set(ids) };
}

/**
 * True when `targetId` is Staff or Family whose access sits entirely inside the moderator's scope.
 * Someone with no groups and no people yet is not covered: the admin places them first.
 */
export async function moderatorCanManage(accountId: string, moderatorId: string, targetId: string): Promise<boolean> {
  const [target] = await db
    .select({ role: account_members.role })
    .from(account_members)
    .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, targetId)))
    .limit(1);
  if (!target || (target.role !== 'member' && target.role !== 'viewer')) return false;
  const scope = await moderatorScope(accountId, moderatorId);
  const theirGroups = await groupIdsOf(targetId, accountId);
  const theirPeople = await db
    .select({ id: profile_members.profile_id })
    .from(profile_members)
    .innerJoin(profiles, eq(profiles.id, profile_members.profile_id))
    .where(and(eq(profile_members.user_id, targetId), eq(profiles.account_id, accountId)));
  if (theirGroups.length + theirPeople.length === 0) return false;
  return theirGroups.every((g) => scope.groups.has(g)) && theirPeople.every((p) => scope.profiles.has(p.id));
}

/** True when every id is a live (not archived) group of this account. */
export async function allLiveGroups(accountId: string, ids: readonly string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const rows = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(and(eq(clusters.account_id, accountId), isNull(clusters.archived_at), inArray(clusters.id, unique)));
  return rows.length === unique.length;
}

/**
 * Who a user may see on the team list. null = everyone (admin). A moderator sees themselves and
 * non-admins whose groups and people all sit inside their scope. Staff and Family see themselves and
 * the non-Family users assigned to the people (or the groups of the people) they can access.
 */
export async function visibleTeamUserIds(accountId: string, userId: string, role: string): Promise<Set<string> | null> {
  if (role === 'admin') return null;
  const out = new Set([userId]);
  const groupLinks = await db.select({ user_id: cluster_members.user_id, cluster_id: cluster_members.cluster_id }).from(cluster_members).where(eq(cluster_members.account_id, accountId));
  const personLinks = await db
    .select({ user_id: profile_members.user_id, profile_id: profile_members.profile_id })
    .from(profile_members)
    .innerJoin(profiles, eq(profiles.id, profile_members.profile_id))
    .where(eq(profiles.account_id, accountId));
  const roles = new Map((await db.select({ id: account_members.user_id, role: account_members.role }).from(account_members).where(eq(account_members.account_id, accountId))).map((r) => [r.id, r.role]));
  if (role === 'moderator') {
    const scope = await moderatorScope(accountId, userId);
    const access = new Map<string, { ok: boolean; any: boolean }>();
    const note = (id: string, inside: boolean) => {
      const a = access.get(id) ?? { ok: true, any: false };
      access.set(id, { ok: a.ok && inside, any: true });
    };
    for (const g of groupLinks) note(g.user_id, scope.groups.has(g.cluster_id));
    for (const p of personLinks) note(p.user_id, scope.profiles.has(p.profile_id));
    for (const [id, a] of access) if (a.ok && a.any && roles.get(id) !== 'admin') out.add(id);
    return out;
  }
  const mine = new Set(await visibleProfileIds(accountId, userId));
  const groups = new Set(
    mine.size ? (await db.select({ c: profiles.cluster_id }).from(profiles).where(inArray(profiles.id, [...mine]))).flatMap((r) => (r.c ? [r.c] : [])) : [],
  );
  for (const g of groupLinks) if (groups.has(g.cluster_id)) out.add(g.user_id);
  for (const p of personLinks) if (mine.has(p.profile_id)) out.add(p.user_id);
  for (const id of [...out]) if (id !== userId && roles.get(id) === 'viewer') out.delete(id);
  return out;
}

/** True when an invite's role, people and groups are all inside the moderator's scope. */
export function inviteWithinScope(scope: { groups: Set<string>; profiles: Set<string> }, i: { role: string; profile_ids: readonly string[]; cluster_ids: readonly string[] }): boolean {
  return (i.role === 'member' || i.role === 'viewer') && i.profile_ids.length + i.cluster_ids.length > 0 && i.profile_ids.every((p) => scope.profiles.has(p)) && i.cluster_ids.every((g) => scope.groups.has(g));
}

/** Replaces a person's groups in this account with `clusterIds`. */
export async function setGroups(
  tx: Pick<typeof db, 'delete' | 'insert'>,
  accountId: string,
  userId: string,
  clusterIds: readonly string[],
): Promise<void> {
  await tx.delete(cluster_members).where(and(eq(cluster_members.account_id, accountId), eq(cluster_members.user_id, userId)));
  const unique = [...new Set(clusterIds)];
  if (unique.length > 0) {
    await tx
      .insert(cluster_members)
      .values(unique.map((cluster_id) => ({ user_id: userId, cluster_id, account_id: accountId, created_at: Date.now() })))
      .onConflictDoNothing();
  }
}
