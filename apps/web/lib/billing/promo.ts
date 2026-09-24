const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up, never below 0. */
export function trialDaysLeft(trialEndsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS));
}
