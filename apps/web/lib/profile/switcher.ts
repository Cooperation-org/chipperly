/** Helpers for the profile switcher and the profiles list: search and group by account. */

const SEARCH_AFTER = 8;

/** Lowercase and strip accents so "jose" finds "José". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function needsSearch(count: number): boolean {
  return count > SEARCH_AFTER;
}

export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const q = fold(query);
  return q ? items.filter((i) => fold(i.name).includes(q)) : items;
}

/** A copy sorted by folded name (accents and case ignored). */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
}

export interface AccountGroup<T> {
  accountId: string;
  accountName: string;
  profiles: T[];
}

/** Groups by account in the order of `accounts`; accounts with no match are dropped. */
export function groupByAccount<T extends { account_id: string; name: string }>(
  profiles: T[],
  accounts: { id: string; name: string }[],
): AccountGroup<T>[] {
  return accounts
    .map((a) => ({ accountId: a.id, accountName: a.name, profiles: sortByName(profiles.filter((p) => p.account_id === a.id)) }))
    .filter((g) => g.profiles.length > 0);
}

/** Drops archived people (archived_at set) from the switcher list. */
export function withoutArchived<T extends { archived_at?: number | null }>(items: T[]): T[] {
  return items.filter((i) => i.archived_at == null);
}
