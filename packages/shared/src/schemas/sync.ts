import { z } from 'zod';
import { TABLE_NAMES, type SyncedTable } from '../constants/tables.js';
import { msTimestampSchema, uuidSchema } from './common.js';

export const SyncedTableSchema = z.enum(TABLE_NAMES);

export const SYNCED_TABLES: readonly SyncedTable[] = TABLE_NAMES;

/** Rows that never conflict: always inserted once, never updated. */
export const APPEND_ONLY_TABLES: readonly SyncedTable[] = [
  'recurrence_skips',
  'step_completions',
  'chip_ledger',
  'attitude_checks',
];

const unknownRowSchema = z.record(z.string(), z.unknown());

export const SyncPullQuerySchema = z.object({
  profile_id: uuidSchema,
  since: z.coerce.number().int().nonnegative().default(0),
});
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

/** One array per synced table, plus `profiles`. Row shape varies by table. */
export const SyncChangesSchema = z.record(z.string(), z.array(unknownRowSchema));
export type SyncChanges = z.infer<typeof SyncChangesSchema>;

export const SyncPullResponseSchema = z.object({
  changes: SyncChangesSchema,
  version: z.number().int().nonnegative(),
  has_more: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

export const MutationOp = z.enum(['upsert', 'delete']);
export type MutationOp = z.infer<typeof MutationOp>;

export const MutationSchema = z.object({
  table: SyncedTableSchema,
  id: uuidSchema,
  op: MutationOp,
  /** Omitted for `delete`; the server sets `deleted_at` itself. */
  row: unknownRowSchema.optional(),
  client_updated_at: msTimestampSchema,
});
export type Mutation = z.infer<typeof MutationSchema>;

export const SyncPushRequestSchema = z.object({
  profile_id: uuidSchema,
  mutations: z.array(MutationSchema),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const RejectedMutationSchema = z.object({
  id: uuidSchema,
  table: SyncedTableSchema,
  reason: z.string(),
  server_row: unknownRowSchema.nullable(),
});
export type RejectedMutation = z.infer<typeof RejectedMutationSchema>;

export const SyncPushResponseSchema = z.object({
  applied: z.array(uuidSchema),
  rejected: z.array(RejectedMutationSchema),
  version: z.number().int().nonnegative(),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
