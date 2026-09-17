import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { AttitudeValue } from '@chipperly/shared/schemas/attitude';
import { syncColumns } from './_sync.js';

/** Append-only. */
export const attitude_checks = pgTable(
  'attitude_checks',
  {
    ...syncColumns(),
    schedule_item_id: uuid('schedule_item_id'),
    value: text('value').$type<AttitudeValue>().notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    created_by: uuid('created_by').notNull(),
  },
  (t) => [index('attitude_checks_profile_version_idx').on(t.profile_id, t.version)],
);
