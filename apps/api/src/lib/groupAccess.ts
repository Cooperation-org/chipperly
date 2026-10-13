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
