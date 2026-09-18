import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

export const MediaKind = z.enum(['image', 'video']);
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaStatus = z.enum(['processing', 'ready', 'failed']);
export type MediaStatus = z.infer<typeof MediaStatus>;

/** Account-scoped, not profile-scoped: no sync columns. */
export const MediaSchema = z.object({
  id: uuidSchema,
  account_id: uuidSchema,
  kind: MediaKind,
  status: MediaStatus,
  storage_key: z.string().min(1),
  content_type: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  bytes: z.number().int().nonnegative(),
  original_bytes: z.number().int().nonnegative(),
  created_by: uuidSchema,
  created_at: msTimestampSchema,
});
export type Media = z.infer<typeof MediaSchema>;

/** POST /media's actual reply for an image upload: a reduced projection of `MediaSchema`, not the row itself. */
export const MediaUploadResponseSchema = z.object({
  id: uuidSchema,
  url: z.string().min(1),
  kind: MediaKind,
  status: MediaStatus,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;
