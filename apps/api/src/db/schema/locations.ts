import { doublePrecision, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { syncColumns } from './_sync.js';

export const locations = pgTable(
  'locations',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
    position: integer('position').notNull(),
    chip_goal: integer('chip_goal').notNull().default(5),
    working_for_reward_id: uuid('working_for_reward_id'),
    // Optional geofence center/radius, groundwork for a later auto-switch feature. Null = no geofence set.
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    radius_m: integer('radius_m'),
  },
  (t) => [index('locations_profile_version_idx').on(t.profile_id, t.version)],
);
