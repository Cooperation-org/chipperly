import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';
import { PushPlatform } from './push.js';

/**
 * A named, caregiver-visible device (technical-plan.md "Devices"). Distinct
 * from `push_tokens` (apps/api/src/db/schema/push.ts): a push token can
 * rotate and self-cleans on send failure, which would silently lose a
 * caregiver-given name if identity lived there. `id` is generated once on
 * the device (lib/device/identity.ts) and never changes, so renaming and
 * "used by <child>" survive a token rotation.
 */
/** One launchable app, as AppBlockerPlugin.listInstalledApps() reports it natively. */
export const InstalledAppSchema = z.object({
  package_name: z.string(),
  app_name: z.string(),
});
export type InstalledApp = z.infer<typeof InstalledAppSchema>;

export const DeviceSchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  /** Which profile this device is mainly used by/locked to; null until the caregiver sets it. */
  profile_id: uuidSchema.nullable(),
  platform: PushPlatform,
  last_seen_at: msTimestampSchema,
  created_at: msTimestampSchema,
  /** Last position this device reported (POST /devices/:id/location), if any -- see locate_request. Never a live/continuous feed, just the most recent on-demand answer. */
  last_lat: z.number().nullable(),
  last_lng: z.number().nullable(),
  last_location_accuracy_m: z.number().nullable(),
  last_location_at: msTimestampSchema.nullable(),
  /**
   * This device's own launchable-apps list, last reported by the device
   * itself (DeviceRegistrationGuard, Android only). Lets a caregiver on a
   * *different* device (their laptop) see and pick from Benny's tablet's
   * real installed apps in Settings > App blocking, instead of that
   * screen only ever working from the one device it's physically opened on.
   */
  installed_apps: z.array(InstalledAppSchema).nullable(),
  /** This device's own last-reported OS lock-task state (PATCH /me/devices/:id/lock-state, LockTaskReconcileGuard) -- what the device observed on itself, not the caregiver's fire-and-forget lock/unlock request. */
  locked: z.boolean(),
});
export type Device = z.infer<typeof DeviceSchema>;

/** Sent by the device itself, on sign-in: creates the row on first sight, otherwise just bumps last_seen_at. */
export const RegisterDeviceBodySchema = z.object({
  platform: PushPlatform,
});
export type RegisterDeviceBody = z.infer<typeof RegisterDeviceBodySchema>;

/**
 * PUT /me/devices/:id's response: the only place `report_token` is ever
 * returned, to the device registering itself (which stores it natively,
 * lib/native/deviceLocator.ts) -- GET /me/devices never includes it.
 */
export const RegisterDeviceResponseSchema = z.object({
  ok: z.literal(true),
  report_token: z.string(),
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponseSchema>;

/** Sent by a caregiver from any device, to name/reassign another device in the list. */
export const UpdateDeviceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).nullable(),
    profile_id: uuidSchema.nullable(),
  })
  .partial();
export type UpdateDeviceBody = z.infer<typeof UpdateDeviceBodySchema>;

/**
 * Answer to a locate request (routes/deviceLocation.ts's POST
 * /devices/:id/location), sent by the device itself -- authenticated by
 * `report_token` matching what the server stored at registration, not a
 * caregiver session, since this runs from a killed-app FCM callback with no
 * JS bridge and thus no access to the normal session tokens.
 */
export const ReportDeviceLocationBodySchema = z.object({
  report_token: z.string(),
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().nullable().optional(),
  at: msTimestampSchema,
});
export type ReportDeviceLocationBody = z.infer<typeof ReportDeviceLocationBodySchema>;

/** Sent by the device itself (DeviceRegistrationGuard), authenticated as a normal signed-in caregiver request like PUT /me/devices/:id, not by report_token -- this only ever runs from the device's own live session, never from a killed-app callback. */
export const ReportInstalledAppsBodySchema = z.object({
  apps: z.array(InstalledAppSchema),
});
export type ReportInstalledAppsBody = z.infer<typeof ReportInstalledAppsBodySchema>;

/** Sent by the device itself (LockTaskReconcileGuard's poll), same auth as ReportInstalledAppsBody -- lets a caregiver on any device see whether this one is actually locked right now, not just whether a lock/unlock request was sent to it. */
export const ReportLockStateBodySchema = z.object({
  locked: z.boolean(),
});
export type ReportLockStateBody = z.infer<typeof ReportLockStateBodySchema>;
