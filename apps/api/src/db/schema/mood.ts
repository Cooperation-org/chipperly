import { bigint, date, index, integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { syncColumns } from './_sync.js';

/** Append-only. Chipper Chart taps; see packages/shared/src/schemas/mood.ts. */
export const mood_events = pgTable(
  'mood_events',
  {
    ...syncColumns(),
    date: date('date', { mode: 'string' }).notNull(),
    delta: integer('delta').notNull(),
    level_after: integer('level_after').notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    created_by: uuid('created_by').notNull(),
  },
  (t) => [index('mood_events_profile_version_idx').on(t.profile_id, t.version)],
);
