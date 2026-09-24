import { TRIAL_DAYS } from '@chipperly/shared/schemas/billing';
import { env } from '../env.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The trial's end: a super admin's extension if set, else 21 days from sign-up. */
export function trialEndsAt(user: { created_at: number; trial_ends_at: number | null }): number {
  return user.trial_ends_at ?? user.created_at + TRIAL_DAYS * DAY_MS;
}

export function isSuperAdmin(email: string): boolean {
  return env.superAdminEmails.has(email.toLowerCase());
}
