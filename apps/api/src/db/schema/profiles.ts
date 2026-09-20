import { bigint, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { ProfileSettings } from '@chipperly/shared/schemas/profile';
import type { LocationNotifyMode } from '@chipperly/shared/schemas/account';

/**
 * Account-scoped, not profile-scoped: no `profile_id` column (see
 * `packages/shared/src/schemas/profile.ts`). Still carries version /
 * client_updated_at / updated_by / deleted_at and is synced read-only.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  account_id: uuid('account_id').notNull(),
  name: text('name').notNull(),
  avatar_emoji: text('avatar_emoji'),
  avatar_photo_id: uuid('avatar_photo_id'),
  share_token: text('share_token').unique(),
  first_then_activity_id: uuid('first_then_activity_id'),
  first_then_reward_id: uuid('first_then_reward_id'),
  settings: jsonb('settings').$type<ProfileSettings>().notNull().default({}),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  client_updated_at: bigint('client_updated_at', { mode: 'number' }).notNull(),
  updated_by: uuid('updated_by').notNull(),
  deleted_at: bigint('deleted_at', { mode: 'number' }),
});

/** Which profiles a `member` (non-admin) account user can see. */
export const profile_members = pgTable(
  'profile_members',
  {
    profile_id: uuid('profile_id').notNull(),
    user_id: uuid('user_id').notNull(),
    relationship_label: text('relationship_label'),
    /**
     * A care-team member's assigned location for this child, and whether a
     * location-change push notifies them only about that one location
     * ('strict') or about any of this child's location changes ('linked').
     * Both null until the parent sets them; no FK, matching this schema's
     * existing no-FK convention.
     */
    assigned_location_id: uuid('assigned_location_id'),
    location_notify_mode: text('location_notify_mode').$type<LocationNotifyMode>(),
  },
  (t) => [primaryKey({ columns: [t.profile_id, t.user_id] })],
);
