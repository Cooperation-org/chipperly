import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Epoch milliseconds, serialized as a JS number in JSON. */
export const msTimestampSchema = z.number().int().nonnegative();

/**
 * Sync columns present on every profile-scoped synced table.
 * `version` is server-assigned (0 on unsynced local rows).
 */
export const SyncColumnsSchema = z.object({
  id: uuidSchema,
  profile_id: uuidSchema,
  version: z.number().int().nonnegative(),
  client_updated_at: msTimestampSchema,
  updated_by: uuidSchema,
  deleted_at: msTimestampSchema.nullable(),
});

export type SyncColumns = z.infer<typeof SyncColumnsSchema>;
