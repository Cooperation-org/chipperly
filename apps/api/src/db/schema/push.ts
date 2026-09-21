import { bigint, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

/**
 * One row per (user, FCM token). No separate device concept: the token
 * itself is already unique per device installation. A rotated token just
 * inserts a new row; a send that comes back "not registered" deletes the
 * stale one (lib/push.ts), so this table self-cleans without a TTL job.
 */
export const push_tokens = pgTable(
  'push_tokens',
  {
    user_id: uuid('user_id').notNull(),
    token: text('token').notNull(),
    platform: text('platform').$type<'android' | 'ios' | 'web'>().notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    /** Which devices.id this token belongs to, if the registering client sent one -- lets a locate request (routes/me.ts) target one specific device instead of every token this user has. */
    device_id: uuid('device_id'),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.token] })],
);
