import type { MutationTable } from '@chipperly/shared/constants/tables';

/**
 * The profile_id an outbox entry pushes under, so pushOutbox() can group
 * mutations per technical-plan.md's per-profile `/sync/push` call. A
 * 'profiles' row has no profile_id field on itself (its own `id` IS the
 * profile); every other synced table carries profile_id on the row.
 *
 * Pure on purpose (like applyPulledRow.ts), so it's testable without
 * constructing the Dexie database.
 */
export function mutationProfileId(
  table: MutationTable,
  id: string,
  row: Record<string, unknown> | undefined,
): string | undefined {
  if (table === 'profiles') return id;
  return (row as { profile_id?: string } | undefined)?.profile_id;
}
