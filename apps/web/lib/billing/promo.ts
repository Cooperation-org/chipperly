import { api } from '@/lib/api/client';
import { refreshMe } from '@/lib/auth/session';

/** Claims an early access code for the signed-in person; rejects when it isn't valid or has ended. */
export async function claimPromoCode(code: string): Promise<void> {
  await api.post('/me/promo-code', { code: code.trim() });
  await refreshMe();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up, never below 0. */
export function trialDaysLeft(trialEndsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS));
}
