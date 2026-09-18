import { v5 as uuidv5 } from 'uuid';

/**
 * Fixed namespace for deriving Chipperly ids from Rails rows (uuid v5).
 * Distinct from `@chipperly/shared` helpers/recurrence.ts
 * `MATERIALIZED_ID_NAMESPACE`, which is for a different purpose (recurring
 * schedule-item materialization).
 */
const RAILS_IMPORT_NAMESPACE = 'a1c9e6f2-7d4b-4a3e-9c8f-2b6d1e0a5f47';

/**
 * Deterministic id for one Rails row: same `(table, id)` always produces
 * the same uuid, so re-running the importer upserts the same rows instead
 * of duplicating them.
 */
export function railsId(table: string, id: number | string): string {
  return uuidv5(`rails:${table}:${id}`, RAILS_IMPORT_NAMESPACE);
}

/**
 * Deterministic id for a location, which is a string on the Rails side
 * (no `locations` table there) rather than a row with its own id.
 */
export function railsLocationId(profileId: number, name: string): string {
  return uuidv5(`rails:location:${profileId}:${name}`, RAILS_IMPORT_NAMESPACE);
}
