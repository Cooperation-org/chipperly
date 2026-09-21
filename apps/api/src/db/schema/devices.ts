import { bigint, doublePrecision, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * A named, caregiver-visible device -- see packages/shared/src/schemas/device.ts
 * for why this is separate from push_tokens. `id` is client-generated
 * (lib/device/identity.ts) and stable for the life of the install, no FK,
 * matching this schema's existing no-FK convention (profiles.ts).
 *
 * `report_token`: a per-device secret, separate from the caregiver's own
 * JWT, generated once on first registration. The native locate-request flow
 * (ChipperlyBlockService's sibling, LocateRequestMessagingService) runs from
 * a killed-app FCM callback with no WebView and thus no access to the JS
 * session's access/refresh tokens -- this lets it authenticate a single
 * narrow write (its own device's location) without them. Never returned by
 * GET /me/devices (routes/me.ts explicitly excludes it).
 */
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  name: text('name'),
  profile_id: uuid('profile_id'),
  platform: text('platform').$type<'android' | 'ios' | 'web'>().notNull(),
  last_seen_at: bigint('last_seen_at', { mode: 'number' }).notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
  report_token: text('report_token'),
  last_lat: doublePrecision('last_lat'),
  last_lng: doublePrecision('last_lng'),
  last_location_accuracy_m: doublePrecision('last_location_accuracy_m'),
  last_location_at: bigint('last_location_at', { mode: 'number' }),
});
