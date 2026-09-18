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
  /**
   * The profile's Chipper Chart level at the moment this chip was earned,
   * null when there was no mood event that day. Optional (not just
   * nullable) so rows written before this column existed still parse.
   * First slice of the attitude-bonus idea; see chips_by_attitude below.
   */
  mood_level: z.number().int().min(-5).max(5).nullable().optional(),
});
export type ChipLedger = z.infer<typeof ChipLedgerSchema>;
