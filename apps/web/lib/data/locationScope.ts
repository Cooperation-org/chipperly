/**
 * Which places an activity or reward shows in (#26).
 *
 * Its own module because both `activities.ts` and `schedule.ts` need it, and
 * `activities.ts` already imports from `schedule.ts` — putting these there
 * would close an import cycle.
 */

export interface LocationScoped {
  location_id: string | null;
  location_ids?: string[] | null;
}

/**
 * The places a row shows in; [] means every place. `location_ids` wins only
 * while it agrees with the legacy `location_id` mirror (one id when exactly
 * one place, else null). If an older client or a `{...row, location_id}`
 * spread changed `location_id`, the two disagree and `location_id` wins.
 */
export function effectiveLocationIds(row: LocationScoped): string[] {
  const ids = row.location_ids;
  if (ids == null) return row.location_id === null ? [] : [row.location_id];
  const mirror = ids.length === 1 ? (ids[0] as string) : null;
  return mirror === row.location_id ? ids : row.location_id === null ? [] : [row.location_id];
}

/** True when the row belongs to `locationId` (or to every place). */
export function matchesLocation(row: LocationScoped, locationId: string): boolean {
  const ids = effectiveLocationIds(row);
  return ids.length === 0 || ids.includes(locationId);
}

/** The two columns to write for a chosen set of places ([] = every place). */
export function locationFields(ids: readonly string[]): { location_id: string | null; location_ids: string[] } {
  const unique = [...new Set(ids)];
  return { location_id: unique.length === 1 ? (unique[0] as string) : null, location_ids: unique };
}
