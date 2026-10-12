import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { SubscriptionStatus } from '@chipperly/shared/schemas/billing';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { trialEndsAt } from './trial.js';

export type NewsletterSegment = 'trial' | 'trial_expired' | 'subscribed';

/** Pure. Paying (or given free access) wins; otherwise it is the trial's end that decides. */
export function newsletterSegment(user: { created_at: number; trial_ends_at: number | null }, subscribed: boolean, now: number = Date.now()): NewsletterSegment {
  if (subscribed) return 'subscribed';
  return now < trialEndsAt(user) ? 'trial' : 'trial_expired';
}

const LIVE: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

/**
 * Everyone who can be mailed, with their segment, for the marketing site's
 * newsletters (GET /internal/newsletter-audience). Unsubscribes are kept on
 * the site, which drops those addresses itself before sending.
 */
export async function newsletterUsers(now: number = Date.now()): Promise<{ email: string; segment: NewsletterSegment }[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, created_at: users.created_at, trial_ends_at: users.trial_ends_at })
    .from(users)
    .where(isNull(users.deactivated_at));
  const paying = await db
    .selectDistinct({ user_id: account_members.user_id })
    .from(account_members)
    .innerJoin(accounts, eq(accounts.id, account_members.account_id))
    .leftJoin(subscriptions, and(eq(subscriptions.account_id, accounts.id), inArray(subscriptions.status, LIVE)))
    .where(or(inArray(subscriptions.status, LIVE), gt(accounts.comp_until, now)));
  const subscribed = new Set(paying.map((p) => p.user_id));
  return rows.map((u) => ({ email: u.email, segment: newsletterSegment(u, subscribed.has(u.id), now) }));
}
