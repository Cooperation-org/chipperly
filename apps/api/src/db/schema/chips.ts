import { bigint, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { ChipReason } from '@chipperly/shared/schemas/chips';
import { syncColumns } from './_sync.js';

/** Append-only. Balance is always derived: see helpers/chips.ts `balanceFor`. */
export const chip_ledger = pgTable(
  'chip_ledger',
  {
    ...syncColumns(),
    /** Null means "counts toward every location's balance". */
    location_id: uuid('location_id'),
    delta: integer('delta').notNull(),
    reason: text('reason').$type<ChipReason>().notNull(),
    ref_id: uuid('ref_id'),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    created_by: uuid('created_by').notNull(),
    /** Chipper Chart level at the moment this chip was earned, null when there was no mood event that day. Migration 0006. */
    mood_level: integer('mood_level'),
  },
  (t) => [index('chip_ledger_profile_version_idx').on(t.profile_id, t.version)],
);
