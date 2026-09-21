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
export const DeviceSchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  /** Which profile this device is mainly used by/locked to; null until the caregiver sets it. */
  profile_id: uuidSchema.nullable(),
  platform: PushPlatform,
  last_seen_at: msTimestampSchema,
  created_at: msTimestampSchema,
});
export type Device = z.infer<typeof DeviceSchema>;

/** Sent by the device itself, on sign-in: creates the row on first sight, otherwise just bumps last_seen_at. */
export const RegisterDeviceBodySchema = z.object({
  platform: PushPlatform,
});
export type RegisterDeviceBody = z.infer<typeof RegisterDeviceBodySchema>;

/** Sent by a caregiver from any device, to name/reassign another device in the list. */
export const UpdateDeviceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).nullable(),
    profile_id: uuidSchema.nullable(),
  })
  .partial();
export type UpdateDeviceBody = z.infer<typeof UpdateDeviceBodySchema>;
