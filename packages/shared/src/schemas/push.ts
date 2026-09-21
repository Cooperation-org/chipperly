import { z } from 'zod';
import { uuidSchema } from './common.js';

export const PushPlatform = z.enum(['android', 'ios', 'web']);
export type PushPlatform = z.infer<typeof PushPlatform>;

export const RegisterPushTokenBodySchema = z.object({
  token: z.string().min(1),
  platform: PushPlatform,
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
