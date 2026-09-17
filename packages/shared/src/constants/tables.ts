/**
 * Every synced table, in dependency order (parents first). This is the one
 * place the list is written out; schemas/sync.ts re-exports it as
 * `SYNCED_TABLES`.
 */
export const TABLE_NAMES = [
  'locations',
  'activities',
  'activity_steps',
  'recurrence_skips',
  'rewards',
  'schedule_items',
  'step_completions',
  'chip_ledger',
  'social_stories',
  'story_pages',
  'attitude_checks',
] as const;

export type SyncedTable = (typeof TABLE_NAMES)[number];
