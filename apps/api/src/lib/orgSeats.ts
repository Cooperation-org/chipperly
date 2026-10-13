import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { profiles } from '../db/schema/profiles.js';
import { env } from '../env.js';
import { renderEmail, siteOrigin } from './emailTemplate.js';
import { sendMail } from './mailer.js';

/**
 * How many people (Primary Users) an organization may have, or null for no limit.
 * Always null for now: the limit arrives with the org tier columns (accounts.seat_limit),
 * and this is the one place that will read it. A limit never blocks adding people; it
 * only shows "27 of 25" and tells the super admins.
 */
export async function seatLimitFor(_accountId: string): Promise<number | null> {
  return null;
}

/** People in the account who count toward the limit: not archived, not deleted. */
export async function seatsUsed(accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(profiles)
    .where(and(eq(profiles.account_id, accountId), isNull(profiles.deleted_at), isNull(profiles.archived_at)));
  return row?.n ?? 0;
}

/**
 * Tells the super admins when an org first goes above its limit. "First" means this change
 * crossed the line (it was at or under before, over after), so it sends once per crossing
 * with no state to keep. Does nothing while there is no limit.
 */
export async function notifyIfOverSeats(accountId: string, before: number, after: number, limit: number | null): Promise<boolean> {
  if (limit === null || before > limit || after <= limit) return false;
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const mail = renderEmail({
    heading: 'An organization is over its seats',
    paragraphs: [`${account?.name ?? 'An organization'} now has ${after} people on a plan for ${limit}.`, 'Nothing is blocked. Talk to them about moving up a tier.'],
    action: { label: 'Open Chipperly', url: siteOrigin() },
  });
  for (const to of env.superAdminEmails) await sendMail({ to, subject: 'Chipperly organization is over its seats', ...mail });
  return true;
}
