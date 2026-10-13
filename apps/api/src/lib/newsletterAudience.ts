import { eq } from 'drizzle-orm';
import type { AccessState } from '@chipperly/shared/schemas/billing';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { accessInputFor, accessState } from './trial.js';

export type NewsletterSegment = 'trial' | 'trial_expired' | 'subscribed';

/**
 * Pure. A user's segment from the access state of each account they are in,
 * the same state the app uses to pause an account. The best account wins:
 * any subscribed account makes them `subscribed`; any account still open, in
 * its trial or in its grace days makes them `trial`. Only an admin of a lapsed
 * account is `trial_expired`, since only an admin can pay. Everyone else
 * (a member of a lapsed account, or someone in no account) is `trial`.
 */
export function newsletterSegment(memberships: { admin: boolean; state: AccessState }[]): NewsletterSegment {
  if (memberships.some((m) => m.state === 'subscribed')) return 'subscribed';
  if (memberships.some((m) => m.state !== 'lapsed')) return 'trial';
  return memberships.some((m) => m.admin) ? 'trial_expired' : 'trial';
}

/**
 * Everyone who can be mailed, with their segment, for the marketing site's
 * newsletters (GET /internal/newsletter-audience). Unsubscribes are kept on
 * the site, which drops those addresses itself before sending.
 */
export async function newsletterUsers(now: number = Date.now()): Promise<{ email: string; segment: NewsletterSegment }[]> {
  // ponytail: three whole tables in memory, fine at this size; page through accounts if it grows large.
  const people = await db
    .select({ id: users.id, email: users.email, created_at: users.created_at, trial_ends_at: users.trial_ends_at, deactivated_at: users.deactivated_at })
    .from(users);
  const members = await db
    .select({
      user_id: account_members.user_id,
      account_id: account_members.account_id,
      role: account_members.role,
      kind: accounts.kind,
      comp_until: accounts.comp_until,
      owner_user_id: accounts.owner_user_id,
    })
    .from(account_members)
    .innerJoin(accounts, eq(accounts.id, account_members.account_id));
  const subs = await db.select({ account_id: subscriptions.account_id, status: subscriptions.status, current_period_end: subscriptions.current_period_end }).from(subscriptions);

  const byId = new Map(people.map((u) => [u.id, u]));
  const subOf = new Map(subs.map((s) => [s.account_id, { status: s.status, current_period_end: s.current_period_end }]));
  const adminsOf = new Map<string, typeof people>();
  for (const m of members) {
    const u = byId.get(m.user_id);
    if (m.role === 'admin' && u) adminsOf.set(m.account_id, [...(adminsOf.get(m.account_id) ?? []), u]);
  }

  // The same rule as accountAccess (lib/trial.ts), for every account at once.
  const stateOf = (m: (typeof members)[number]): AccessState =>
    env.stripeEnabled ? accessState(accessInputFor(m, adminsOf.get(m.account_id) ?? [], subOf.get(m.account_id) ?? null), now).state : 'open';

  const mine = new Map<string, { admin: boolean; state: AccessState }[]>();
  for (const m of members) mine.set(m.user_id, [...(mine.get(m.user_id) ?? []), { admin: m.role === 'admin', state: stateOf(m) }]);
  return people.filter((u) => u.deactivated_at === null).map((u) => ({ email: u.email, segment: newsletterSegment(mine.get(u.id) ?? []) }));
}
