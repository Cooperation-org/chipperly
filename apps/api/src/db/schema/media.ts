import { bigint, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { MediaKind, MediaStatus } from '@chipperly/shared/schemas/media';

/** Account-scoped, not profile-scoped: no sync columns. */
export const media = pgTable('media', {
  id: uuid('id').primaryKey(),
  account_id: uuid('account_id').notNull(),
  kind: text('kind').$type<MediaKind>().notNull(),
  status: text('status').$type<MediaStatus>().notNull(),
  storage_key: text('storage_key').notNull(),
  content_type: text('content_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  duration_ms: integer('duration_ms'),
  bytes: integer('bytes').notNull(),
  original_bytes: integer('original_bytes').notNull(),
  created_by: uuid('created_by').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});
