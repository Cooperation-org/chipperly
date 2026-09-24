import { z } from 'zod';
import { uuidSchema } from './common.js';

export const PushPlatform = z.enum(['android', 'ios', 'web']);
export type PushPlatform = z.infer<typeof PushPlatform>;

export const RegisterPushTokenBodySchema = z.object({
  token: z.string().min(1),
  platform: PushPlatform,
  /** This installation's devices.id (lib/device/identity.ts), so a locate request can target this one device instead of every token this user has registered. */
  device_id: uuidSchema.optional(),
});
export type RegisterPushTokenBody = z.infer<typeof RegisterPushTokenBodySchema>;

export const UnregisterPushTokenBodySchema = z.object({
  token: z.string().min(1),
});
export type UnregisterPushTokenBody = z.infer<typeof UnregisterPushTokenBodySchema>;

export const LocationChangedBodySchema = z.object({
  new_location_id: uuidSchema.nullable(),
  old_location_id: uuidSchema.nullable(),
});
export type LocationChangedBody = z.infer<typeof LocationChangedBodySchema>;

/** Where the child asked for a reward: finished a First-then, filled the chip board, or redeemed one from Free time. */
export const RewardRequestSource = z.enum(['first_then', 'chips', 'free_time']);
export type RewardRequestSource = z.infer<typeof RewardRequestSource>;

export const RewardRequestBodySchema = z.object({
  reward_name: z.string().min(1).max(200),
  source: RewardRequestSource,
  /** Where the child is; care-team members assigned to another location aren't alerted. */
  location_id: uuidSchema.nullable().optional(),
  /** The child's own device, so its caregiver account doesn't alert the phone the child is holding. */
  device_id: uuidSchema.optional(),
});
export type RewardRequestBody = z.infer<typeof RewardRequestBodySchema>;
