import type { EntityTable } from 'dexie';

export { getCurrentUserId } from '../auth/session';

/** Next position for a new row appended at the end of a profile-scoped list. */
export async function nextPosition<
  T extends { id: string; profile_id: string; position: number; deleted_at: number | null },
>(table: EntityTable<T, 'id'>, profileId: string): Promise<number> {
  const rows = await table.where('profile_id').equals(profileId).toArray();
  return rows.reduce((max, row) => (row.deleted_at === null ? Math.max(max, row.position) : max), -1) + 1;
}
