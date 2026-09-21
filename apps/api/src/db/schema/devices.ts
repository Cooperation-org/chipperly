import { bigint, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * A named, caregiver-visible device -- see packages/shared/src/schemas/device.ts
 * for why this is separate from push_tokens. `id` is client-generated
 * (lib/device/identity.ts) and stable for the life of the install, no FK,
 * matching this schema's existing no-FK convention (profiles.ts).
 */
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  name: text('name'),
  profile_id: uuid('profile_id'),
  platform: text('platform').$type<'android' | 'ios' | 'web'>().notNull(),
  last_seen_at: bigint('last_seen_at', { mode: 'number' }).notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});
