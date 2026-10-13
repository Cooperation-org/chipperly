import { bigint, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * "Family keeps a copy": one row per person, family user and trigger (migration 0053).
 * The emailed link carries a one-time token, stored hashed; used_at makes it single use.
 */
export const family_handovers = pgTable('family_handovers', {
  id: uuid('id').primaryKey(),
  profile_id: uuid('profile_id').notNull(),
  user_id: uuid('user_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  /** 'archived' | 'removed' | 'lapsed'. */
  reason: text('reason').$type<'archived' | 'removed' | 'lapsed'>().notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
  used_at: bigint('used_at', { mode: 'number' }),
  expires_at: bigint('expires_at', { mode: 'number' }).notNull(),
});
