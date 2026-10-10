import { ERASE_AFTER_DAYS } from '@chipperly/shared/schemas/billing';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The later of now and the date they already have, plus this many days: pressing twice adds twice. */
export function compUntilAfter(current: number | null, days: number, now: number): number {
  return Math.max(current ?? 0, now) + days * DAY_MS;
}

/** When a closed sign-in may be erased, and whether that is now. */
export function eraseDue(deactivatedAt: number | null, now: number): { at: number; due: boolean } | null {
  if (deactivatedAt === null) return null;
  const at = deactivatedAt + ERASE_AFTER_DAYS * DAY_MS;
  return { at, due: now >= at };
}
