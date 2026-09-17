import type { ChipLedger } from '../schemas/chips.js';

/**
 * Chip balance for a location, or the shared pool when `locationId` is
 * null: `sum(delta) where location_id = locationId or location_id is null`.
 * Never stored; always derived from the ledger.
 */
export function balanceFor(
  ledger: readonly Pick<ChipLedger, 'location_id' | 'delta' | 'deleted_at'>[],
  locationId: string | null,
): number {
  return ledger
    .filter((row) => row.deleted_at === null)
    .filter((row) => row.location_id === locationId || row.location_id === null)
    .reduce((sum, row) => sum + row.delta, 0);
}
