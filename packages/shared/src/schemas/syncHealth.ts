import { z } from 'zod';
import { MutationOp } from './sync.js';
import { msTimestampSchema, uuidSchema } from './common.js';

/**
 * Why a write is still on a device and not on the server.
 *
 * `held`: refused for now (the device is locked to a child, or the account
 * has lapsed) and sent again later. `dead`: refused for good, or never
 * sendable; kept on the device and shown until someone deals with it.
 */
export const ParkedKindSchema = z.enum(['held', 'dead']);
export type ParkedKind = z.infer<typeof ParkedKindSchema>;

/** What a device says about its own unsent writes after each sync cycle (PUT /me/sync-health). */
export const SyncHealthReportSchema = z.object({
  device_id: uuidSchema,
  /** Writes queued and not yet accepted. */
  pending: z.number().int().nonnegative(),
  /** When the oldest queued write was made, null with nothing queued. */
  oldest_at: msTimestampSchema.nullable(),
  held: z.number().int().nonnegative(),
  dead: z.number().int().nonnegative(),
});
export type SyncHealthReport = z.infer<typeof SyncHealthReportSchema>;

/**
 * A write the device could not get onto the server and the server never saw
 * refused: the whole request failed, the write names no profile, or it was
 * left behind when someone else signed in. `row` is left out for a write that
 * belongs to another person.
 */
export const ClientRejectionSchema = z.object({
  table: z.string().min(1).max(40),
  id: uuidSchema,
  op: MutationOp,
  reason: z.string().min(1).max(80),
  client_updated_at: msTimestampSchema,
  profile_id: uuidSchema.nullable(),
  row: z.record(z.string(), z.unknown()).optional(),
});
export type ClientRejection = z.infer<typeof ClientRejectionSchema>;

export const ClientRejectionReportSchema = z.object({
  device_id: uuidSchema.optional(),
  items: z.array(ClientRejectionSchema).min(1).max(200),
});
export type ClientRejectionReport = z.infer<typeof ClientRejectionReportSchema>;

/** One refused write as the super admin screen shows it. The saved row itself is only sent on request. */
export const AdminSyncRejectionSchema = z.object({
  id: uuidSchema,
  created_at: msTimestampSchema,
  last_seen_at: msTimestampSchema,
  seen_count: z.number().int(),
  user_email: z.string().nullable(),
  profile_id: uuidSchema.nullable(),
  profile_name: z.string().nullable(),
  account_name: z.string().nullable(),
  device_id: z.string().nullable(),
  table_name: z.string(),
  row_id: uuidSchema,
  op: z.string(),
  reason: z.string(),
  source: z.enum(['server', 'client']),
  locked: z.boolean(),
  has_payload: z.boolean(),
  resolved_at: msTimestampSchema.nullable(),
  resolution: z.string().nullable(),
});
export type AdminSyncRejection = z.infer<typeof AdminSyncRejectionSchema>;

export const AdminSyncDeviceSchema = z.object({
  id: uuidSchema,
  user_email: z.string().nullable(),
  name: z.string().nullable(),
  platform: z.string(),
  last_seen_at: msTimestampSchema,
  sync_reported_at: msTimestampSchema.nullable(),
  pending: z.number().int(),
  oldest_at: msTimestampSchema.nullable(),
  held: z.number().int(),
  dead: z.number().int(),
});
export type AdminSyncDevice = z.infer<typeof AdminSyncDeviceSchema>;

/** Rows on the server that point at a row the server does not have. */
export const AdminSyncOrphanSchema = z.object({
  profile_id: uuidSchema,
  profile_name: z.string().nullable(),
  account_name: z.string().nullable(),
  /** e.g. "step_completions without a schedule item". */
  kind: z.string(),
  count: z.number().int(),
  /** When the oldest of them was written. */
  oldest_at: msTimestampSchema,
});
export type AdminSyncOrphan = z.infer<typeof AdminSyncOrphanSchema>;

export const AdminSyncHealthSchema = z.object({
  /** True when anything below needs a person to look. */
  attention: z.boolean(),
  open_rejections: z.number().int(),
  rejections: z.array(AdminSyncRejectionSchema),
  devices: z.array(AdminSyncDeviceSchema),
  orphans: z.array(AdminSyncOrphanSchema),
});
export type AdminSyncHealth = z.infer<typeof AdminSyncHealthSchema>;

export const AdminReplayResultSchema = z.object({
  ok: z.boolean(),
  /** 'replayed', 'superseded' (the server already has something newer), or the reason it was refused again. */
  result: z.string(),
});
export type AdminReplayResult = z.infer<typeof AdminReplayResultSchema>;
