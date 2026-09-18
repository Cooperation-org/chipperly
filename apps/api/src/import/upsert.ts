import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * `set` clause for a bulk `onConflictDoUpdate`: every column except `id`
 * takes the conflicting row's own incoming value (`excluded."col"`), not a
 * value shared across the whole insert batch. Every write in this importer
 * is an upsert on `id` so re-running it is idempotent.
 */
export function excludedSet<T extends PgTable>(table: T): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, AnyPgColumn>;
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (key === 'id') continue;
    set[key] = sql`excluded.${sql.identifier(column.name)}`;
  }
  return set;
}
