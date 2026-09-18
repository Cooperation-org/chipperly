import { v5 as uuidv5 } from 'uuid';
import type { Activity, RecurrenceSkip } from '../schemas/activity.js';
import { weekday } from './date.js';

/** Fixed namespace for deriving materialized schedule-item ids (uuid v5). */
export const MATERIALIZED_ID_NAMESPACE = 'e6e6c6b0-6b5a-4b8e-9b1e-7f6a5c4d3e2f';

/**
 * Whether a recurring activity produces an occurrence on `isoDate`, given
 * any recorded skips for it.
 */
export function occursOn(
  activity: Pick<Activity, 'recurrence' | 'recurrence_weekdays'>,
  isoDate: string,
  skips: readonly Pick<RecurrenceSkip, 'date'>[],
): boolean {
  if (!activity.recurrence) return false;
  if (skips.some((skip) => skip.date === isoDate)) return false;

  const wd = weekday(isoDate);
  switch (activity.recurrence) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekends':
      return wd === 0 || wd === 6;
    case 'weekly':
      return (activity.recurrence_weekdays ?? []).includes(wd);
  }
}

/** Deterministic id for a recurring activity's occurrence on one date. */
export function materializedId(activityId: string, isoDate: string): string {
  return uuidv5(`${activityId}:${isoDate}`, MATERIALIZED_ID_NAMESPACE);
}
