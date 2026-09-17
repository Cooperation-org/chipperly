import { z } from 'zod';
import { msTimestampSchema, SyncColumnsSchema, uuidSchema } from './common.js';

export const ChipReason = z.enum(['task', 'step', 'manual', 'redeem', 'adjust']);
export type ChipReason = z.infer<typeof ChipReason>;

/** Append-only. Balance is always derived: see helpers/chips.ts `balanceFor`. */
export const ChipLedgerSchema = SyncColumnsSchema.extend({
  /** Null means "counts toward every location's balance". */
  location_id: uuidSchema.nullable(),
  delta: z.number().int(),
  reason: ChipReason,
  ref_id: uuidSchema.nullable(),
  created_at: msTimestampSchema,
  created_by: uuidSchema,
});
export type ChipLedger = z.infer<typeof ChipLedgerSchema>;
