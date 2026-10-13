import type { Profile } from '@chipperly/shared/schemas/profile';

/**
 * Local profile ids that `/me` no longer lists. Only accounts present in `/me` are judged,
 * and a profile with unsent outbox work (`pendingIds`: outbox row ids and their profile_id) stays
 * so that work is not orphaned.
 */
export function staleProfileIds(
  local: Pick<Profile, 'id' | 'account_id'>[],
  me: { accounts: { account: { id: string } }[]; profiles: { id: string }[] },
  pendingIds: Set<string>,
): string[] {
  const accounts = new Set(me.accounts.map((a) => a.account.id));
  const kept = new Set(me.profiles.map((p) => p.id));
  return local.filter((p) => accounts.has(p.account_id) && !kept.has(p.id) && !pendingIds.has(p.id)).map((p) => p.id);
}
