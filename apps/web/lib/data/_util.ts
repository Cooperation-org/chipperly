import type { EntityTable } from 'dexie';
import { getKv } from '../db/kv';

const CURRENT_USER_KEY = 'current_user_id';

/**
 * Mirrors lib/sync/mutate.ts's own private helper: a couple of writes here
 * (chip ledger `created_by`, attitude checks, the `profiles` row patched
 * directly since mutate.ts does not cover that table yet — see this
 * package's report) need the signed-in user id and don't already have it
 * passed in by the caller.
 */
export async function getCurrentUserId(): Promise<string> {
  const id = await getKv<string>(CURRENT_USER_KEY);
  if (!id) throw new Error('lib/data: no signed-in user');
  return id;
}

/** Next position for a new row appended at the end of a profile-scoped list. */
export async function nextPosition<
  T extends { id: string; profile_id: string; position: number; deleted_at: number | null },
>(table: EntityTable<T, 'id'>, profileId: string): Promise<number> {
  const rows = await table.where('profile_id').equals(profileId).toArray();
  return rows.reduce((max, row) => (row.deleted_at === null ? Math.max(max, row.position) : max), -1) + 1;
}
