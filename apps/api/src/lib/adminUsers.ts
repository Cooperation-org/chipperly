import { ERASE_AFTER_DAYS } from '@chipperly/shared/schemas/billing';
import { TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { sql } from '../db/client.js';
import { AppError } from '../plugins/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a closed sign-in may be erased: 30 days after it was closed. */
export function eraseAllowedAt(deactivatedAt: number): number {
  return deactivatedAt + ERASE_AFTER_DAYS * DAY_MS;
}

/** Closes the sign-in: no new session, and every open one stops at its next refresh. Nothing is removed. */
export async function deactivateUser(userId: string, now: number = Date.now()): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`update users set deactivated_at = ${now} where id = ${userId} and deactivated_at is null`;
    await tx`update sessions set revoked_at = ${now} where user_id = ${userId} and revoked_at is null`;
  });
}

export async function reactivateUser(userId: string): Promise<void> {
  await sql`update users set deactivated_at = null where id = ${userId}`;
}

export interface EraseResult {
  /** Accounts removed with all their content, because nobody else was in them. */
  accounts_removed: string[];
  /** Accounts the person was only taken out of, because other people use them. */
  accounts_left: string[];
  rows_removed: number;
}

/**
 * Removes a person for good. Only what belongs to them alone goes:
 * - an account with nobody else in it is removed with every profile and everything in those profiles;
 * - an account other people use stays, and loses only this member (ownership passes to another admin,
 *   or to the longest-standing member, who becomes one).
 * Refused while money is involved (a Stripe subscription that is still live, a seller account, a purchase):
 * those need a person to settle them first.
 * The uploaded files of a removed account stay on disk; only their rows go.
 * ponytail: file cleanup is a separate sweep, add it when storage matters.
 */
export async function eraseUser(userId: string): Promise<EraseResult> {
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`select id from users where id = ${userId} for update`;
    if (!user) throw new AppError(404, 'not_found', 'User not found');

    const [{ money }] = await tx<{ money: number }[]>`
      select (
        (select count(*) from community_sellers where user_id = ${userId}) +
        (select count(*) from community_purchases where buyer_user_id = ${userId} or seller_user_id = ${userId})
      )::int as money`;
    if (money > 0) throw new AppError(409, 'has_payments', 'This person has sold or bought something. Settle that in Stripe first.');

    const memberships = await tx<{ account_id: string; name: string; others: number }[]>`
      select m.account_id, a.name,
        (select count(*)::int from account_members o where o.account_id = m.account_id and o.user_id <> ${userId}) as others
      from account_members m join accounts a on a.id = m.account_id where m.user_id = ${userId}`;
    const alone = memberships.filter((m) => m.others === 0);
    const shared = memberships.filter((m) => m.others > 0);
    const aloneIds = alone.map((m) => m.account_id);

    if (aloneIds.length > 0) {
      const [{ live }] = await tx<{ live: number }[]>`
        select count(*)::int as live from subscriptions where account_id = any(${aloneIds}) and status in ('active', 'trialing', 'past_due')`;
      if (live > 0) throw new AppError(409, 'has_subscription', 'This person has a live subscription. Cancel it in Stripe first.');
    }

    let rows = 0;
    const run = async (query: Promise<{ count: number }>): Promise<void> => {
      rows += (await query).count;
    };

    if (aloneIds.length > 0) {
      const profileIds = (await tx<{ id: string }[]>`select id from profiles where account_id = any(${aloneIds})`).map((p) => p.id);
      if (profileIds.length > 0) {
        // Children before parents, the reverse of the order they are created in.
        for (const table of [...TABLE_NAMES].reverse()) await run(tx`delete from ${tx(table)} where profile_id = any(${profileIds})`);
        await run(tx`delete from profile_members where profile_id = any(${profileIds})`);
        await run(tx`delete from review_reminders where profile_id = any(${profileIds})`);
        await run(tx`update devices set profile_id = null where profile_id = any(${profileIds})`);
        await run(tx`delete from profiles where id = any(${profileIds})`);
      }
      await run(tx`delete from media where account_id = any(${aloneIds})`);
      await run(tx`delete from invites where account_id = any(${aloneIds})`);
      await run(tx`delete from subscriptions where account_id = any(${aloneIds})`);
      await run(tx`delete from account_members where account_id = any(${aloneIds})`);
      await run(tx`delete from accounts where id = any(${aloneIds})`);
    }

    for (const m of shared) {
      await run(tx`delete from account_members where account_id = ${m.account_id} and user_id = ${userId}`);
      const [owner] = await tx<{ owner_user_id: string }[]>`select owner_user_id from accounts where id = ${m.account_id}`;
      const [admin] = await tx<{ user_id: string }[]>`select user_id from account_members where account_id = ${m.account_id} and role = 'admin' limit 1`;
      const [anyone] = await tx<{ user_id: string }[]>`select user_id from account_members where account_id = ${m.account_id} limit 1`;
      const heir = admin?.user_id ?? anyone?.user_id;
      // An account must keep an admin, or nobody can manage it or pay for it.
      if (!admin && heir) await tx`update account_members set role = 'admin' where account_id = ${m.account_id} and user_id = ${heir}`;
      if (owner?.owner_user_id === userId && heir) await tx`update accounts set owner_user_id = ${heir} where id = ${m.account_id}`;
    }

    // What the person wrote in the community goes with them.
    const postIds = (await tx<{ id: string }[]>`select id from community_posts where author_user_id = ${userId}`).map((p) => p.id);
    if (postIds.length > 0) {
      await run(tx`delete from community_comments where post_id = any(${postIds})`);
      await run(tx`delete from community_media where post_id = any(${postIds})`);
      await run(tx`delete from community_posts where id = any(${postIds})`);
    }
    await run(tx`delete from community_comments where author_user_id = ${userId}`);
    await run(tx`delete from community_reports where reporter_user_id = ${userId}`);
    await run(tx`delete from community_profiles where user_id = ${userId}`);

    for (const table of ['sessions', 'devices', 'push_tokens', 'email_verifications', 'password_resets', 'review_reminders', 'event_reminder_sent', 'profile_members']) {
      await run(tx`delete from ${tx(table)} where user_id = ${userId}`);
    }
    // Feedback is kept, with no name on it.
    await tx`update feedback set user_id = null, contact_email = null where user_id = ${userId}`;
    await run(tx`delete from users where id = ${userId}`);

    return { accounts_removed: alone.map((m) => m.name), accounts_left: shared.map((m) => m.name), rows_removed: rows };
  });
}
