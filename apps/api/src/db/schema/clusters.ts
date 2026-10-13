import { bigint, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * A named group of people inside an organization (a site, team or caseload).
 * Names are unique per account among non-archived clusters, case-insensitively
 * (a partial unique index in migration 0050).
 */
export const clusters = pgTable('clusters', {
  id: uuid('id').primaryKey(),
  account_id: uuid('account_id').notNull(),
  name: text('name').notNull(),
  archived_at: bigint('archived_at', { mode: 'number' }),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});
