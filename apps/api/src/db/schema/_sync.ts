import { bigint, uuid } from 'drizzle-orm/pg-core';

/**
 * The six sync columns every profile-scoped synced table carries. JS
 * property names match the Postgres column names match the shared zod
 * field names (`snake_case` everywhere, no mapping layer) so a row drizzle
 * returns can be parsed directly by `SyncColumnsSchema`.
 *
 * `version` and `client_updated_at`/`deleted_at` are `bigint` in Postgres
 * but read back as JS `number` (`mode: 'number'`), matching
 * `packages/shared/src/schemas/common.ts`.
 *
 * `id` is client-generated (uuid v7), never a Postgres default. `version`
 * is overwritten by the `set_sync_version()` trigger on every insert/update;
 * the `default(0)` here only matters before the trigger fires.
 */
export function syncColumns() {
  return {
    id: uuid('id').primaryKey(),
    profile_id: uuid('profile_id').notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(0),
    client_updated_at: bigint('client_updated_at', { mode: 'number' }).notNull(),
    updated_by: uuid('updated_by').notNull(),
    deleted_at: bigint('deleted_at', { mode: 'number' }),
  };
}
