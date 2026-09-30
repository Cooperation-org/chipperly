import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { syncColumns } from './_sync.js';

export const rewards = pgTable(
  'rewards',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
    chip_cost: integer('chip_cost'),
    /** Null means "everywhere". */
    location_id: uuid('location_id'),
    /** [] = every place; null = pre-0022 row, read `location_id`. */
    location_ids: uuid('location_ids').array(),
    /** True = free-time choice-board tile, costs nothing. */
    always_available: boolean('always_available').notNull().default(false),
    position: integer('position').notNull(),
    /** Free choice unlocked once this activity is done today; null = no requirement. */
    requires_activity_id: uuid('requires_activity_id'),
    screen_time_minutes: integer('screen_time_minutes'),
    screen_time_packages: text('screen_time_packages').array(),
    screen_time_whole_phone: boolean('screen_time_whole_phone'),
  },
  (t) => [index('rewards_profile_version_idx').on(t.profile_id, t.version)],
);
