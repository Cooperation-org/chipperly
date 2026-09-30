import { and, eq } from 'drizzle-orm';
import { GRACE_DAYS, TRIAL_DAYS, type Access, type SubscriptionStatus } from '@chipperly/shared/schemas/billing';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { profiles } from '../db/schema/profiles.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import { env } from '../env.js';
import { AppError } from '../plugins/errors.js';
import { priceIdForKind } from './stripe.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The trial's end: a super admin's extension if set, else 21 days from sign-up. */
export function trialEndsAt(user: { created_at: number; trial_ends_at: number | null }): number {
  return user.trial_ends_at ?? user.created_at + TRIAL_DAYS * DAY_MS;
}

export function isSuperAdmin(email: string): boolean {
  return env.superAdminEmails.has(email.toLowerCase());
}

// ---- what happens when a trial or subscription ends ----
//
// Policy: after the trial (or the last paid period) ends there is a GRACE_DAYS
// window where nothing changes. After that the account is `lapsed`, and ONLY
// creating new caregiver content pauses (see isPausedCreation and
// assertCanCreate). Reading, exporting, editing, deleting, completing tasks,
// the child view, in-progress routines and offline use never pause. A
// subscription in `active`, `trialing` or `past_due` never lapses (Stripe is
// still retrying a failed card). With billing off, or for an account kind that
// has no price to pay, nothing ever lapses.

const LIVE = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due']);

export interface AccessInput {
  /** env.stripeEnabled. */
  billingOn: boolean;
  /** A price id is set for this account's kind; without one there is nothing to pay, so nothing may lock. */
  canCheckout: boolean;
  /** An admin of the account is a super admin. */
  exempt: boolean;
  /** The latest trial end among the account's admins: one admin still in their trial keeps the account open. */
  trialEnd: number;
  sub: { status: SubscriptionStatus; current_period_end: number | null } | null;
}

/** Pure. Boundaries: `now` equal to the trial end is already grace; `now` equal to the end of grace is lapsed. */
export function accessState(input: AccessInput, now: number = Date.now()): Access {
  const open: Access = { state: 'open', ended_at: null, pauses_at: null, write_paused: false };
  if (!input.billingOn || !input.canCheckout || input.exempt) return open;
  if (input.sub && LIVE.has(input.sub.status)) return { ...open, state: 'subscribed', ended_at: input.sub.current_period_end };
  const endedAt = Math.max(input.trialEnd, input.sub?.current_period_end ?? 0);
  const pausesAt = endedAt + GRACE_DAYS * DAY_MS;
  if (now < endedAt) return { state: 'trial', ended_at: endedAt, pauses_at: pausesAt, write_paused: false };
  if (now < pausesAt) return { state: 'grace', ended_at: endedAt, pauses_at: pausesAt, write_paused: false };
  return { state: 'lapsed', ended_at: endedAt, pauses_at: pausesAt, write_paused: true };
}

/** Loads what accessState needs. With Stripe unset it returns before touching the database. */
export async function accountAccess(accountId: string, now: number = Date.now()): Promise<Access> {
  if (!env.stripeEnabled) return accessState({ billingOn: false, canCheckout: false, exempt: false, trialEnd: 0, sub: null }, now);
  const [account] = await db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return accessState({ billingOn: false, canCheckout: false, exempt: false, trialEnd: 0, sub: null }, now);
  const admins = await db
    .select({ email: users.email, created_at: users.created_at, trial_ends_at: users.trial_ends_at })
    .from(account_members)
    .innerJoin(users, eq(users.id, account_members.user_id))
    .where(and(eq(account_members.account_id, accountId), eq(account_members.role, 'admin')));
  const [sub] = await db
    .select({ status: subscriptions.status, current_period_end: subscriptions.current_period_end })
    .from(subscriptions)
    .where(eq(subscriptions.account_id, accountId))
    .limit(1);
  return accessState(
    {
      billingOn: true,
      canCheckout: priceIdForKind(account.kind) !== undefined,
      exempt: admins.some((a) => isSuperAdmin(a.email)),
      trialEnd: Math.max(0, ...admins.map(trialEndsAt)),
      sub: sub ?? null,
    },
    now,
  );
}

export const LAPSED_MESSAGE =
  'The free trial has ended, so adding new things is paused. Everything you have is still here and works as before, and you can export it any time. Subscribe from Settings to add more.';

/** REST creation routes call this first: 402 for a lapsed account, nothing otherwise. */
export async function assertCanCreate(accountId: string): Promise<void> {
  if ((await accountAccess(accountId)).write_paused) throw new AppError(402, 'subscription_lapsed', LAPSED_MESSAGE);
}

/** For /sync/push: true when this profile's account has lapsed. One query when Stripe is on, none when it is off. */
export async function writePausedForProfile(profileId: string): Promise<boolean> {
  if (!env.stripeEnabled) return false;
  const [profile] = await db.select({ account_id: profiles.account_id }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
  return profile ? (await accountAccess(profile.account_id)).write_paused : false;
}

// Caregiver-authored content. Completions, moods, chips, skips and everything
// a child does are deliberately absent, as are edits and deletes of anything.
const PAUSED_TABLES: ReadonlySet<string> = new Set([
  'locations',
  'activities',
  'activity_steps',
  'rewards',
  'social_stories',
  'story_pages',
  'day_plans',
  'day_events',
]);

/**
 * Pure. Is this sync mutation a brand-new piece of caregiver content? A
 * recurring schedule item is exempt: the device materialises today's routine
 * itself, and blocking it would break the child's day. `alreadyStored` is
 * whether a row with this id exists on the server (an edit, not a creation).
 */
export function isPausedCreation(
  mutation: { table: string; op: 'upsert' | 'delete'; row?: { source?: unknown } | null },
  alreadyStored: boolean,
): boolean {
  if (mutation.op !== 'upsert' || alreadyStored) return false;
  if (PAUSED_TABLES.has(mutation.table)) return true;
  return mutation.table === 'schedule_items' && mutation.row?.source === 'manual';
}
