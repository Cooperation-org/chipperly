import { sql } from 'drizzle-orm';
import { bigint, boolean, check, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { AccountKind, Role } from '@chipperly/shared/schemas/account';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  kind: text('kind').$type<AccountKind>().notNull(),
  name: text('name').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
  /**
   * The single account owner: set to the creator at account creation, more
   * privileged than any other 'admin' in account_members (see the parent
   * task's location-history feature for why this distinction exists). Check
   * with `isAccountOwner` in plugins/auth.ts. No FK: this schema doesn't use
   * them anywhere, integrity is app-enforced.
   */
  owner_user_id: uuid('owner_user_id').notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    password_hash: text('password_hash'),
    auth_provider: text('auth_provider').$type<'google' | 'apple'>(),
    auth_provider_id: text('auth_provider_id'),
    display_name: text('display_name').notNull(),
    pin_hash: text('pin_hash'),
    email_verified_at: bigint('email_verified_at', { mode: 'number' }),
    /** Epoch ms the "parent/guardian/caregiver, 18+, agree to Terms and Privacy" checkbox was ticked (SOW Q21 / COPPA). Nullable: null for accounts created before this column existed. */
    consented_at: bigint('consented_at', { mode: 'number' }),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    /** End of the free trial; null = 21 days from created_at (lib/trial.ts). Set when a super admin extends it. */
    trial_ends_at: bigint('trial_ends_at', { mode: 'number' }),
    /** The offer (promo_codes.code) this person's own code was issued under, and when. */
    promo_code: text('promo_code'),
    promo_code_at: bigint('promo_code_at', { mode: 'number' }),
    /** Their own early access code (EARLY-XXXXXX), given by Chipperly, not typed in; the discount applies once the trial ends. */
    personal_code: text('personal_code').unique(),
    /** IANA zone the app last reported (e.g. "Africa/Cairo"), so routine reminders arrive at their local hour. */
    time_zone: text('time_zone'),
  },
  // Belt-and-suspenders: callers should already lowercase before insert.
  (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)],
);

export const account_members = pgTable(
  'account_members',
  {
    account_id: uuid('account_id').notNull(),
    user_id: uuid('user_id').notNull(),
    role: text('role').$type<Role>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.account_id, t.user_id] })],
);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey(),
  account_id: uuid('account_id').notNull(),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  profile_ids: uuid('profile_ids').array().notNull(),
  relationship_label: text('relationship_label'),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: bigint('expires_at', { mode: 'number' }).notNull(),
  accepted_at: bigint('accepted_at', { mode: 'number' }),
  invited_by: uuid('invited_by').notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  refresh_token_hash: text('refresh_token_hash').notNull().unique(),
  device_id: text('device_id'),
  user_agent: text('user_agent'),
  expires_at: bigint('expires_at', { mode: 'number' }).notNull(),
  revoked_at: bigint('revoked_at', { mode: 'number' }),
  /** Set by POST /me/lock, cleared by POST /me/unlock (PIN checked server-side). plugins/auth.ts derives `request.locked` from this, never from a client header. */
  locked_profile_id: uuid('locked_profile_id'),
});

/** One-time tokens for the forgot/reset-password email link. */
export const password_resets = pgTable('password_resets', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: bigint('expires_at', { mode: 'number' }).notNull(),
  used_at: bigint('used_at', { mode: 'number' }),
});

/** One-time tokens for the "verify your email" link. */
export const email_verifications = pgTable('email_verifications', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: bigint('expires_at', { mode: 'number' }).notNull(),
  used_at: bigint('used_at', { mode: 'number' }),
});

/**
 * Early access offers (EARLYCHIPPER), managed from the super admin dashboard.
 * Nobody types these: each person gets their own code (users.personal_code)
 * under an offer, automatically when they sign up inside an auto_issue
 * offer's dates, or from the dashboard. Payments aren't wired yet; the
 * discount is honoured once they are, after the trial ends.
 */
export const promo_codes = pgTable('promo_codes', {
  code: text('code').primaryKey(),
  /** null until decided in the admin dashboard. */
  percent_off: integer('percent_off'),
  applies_to: text('applies_to').$type<'annual' | 'any'>().notNull().default('annual'),
  valid_from: bigint('valid_from', { mode: 'number' }).notNull(),
  valid_until: bigint('valid_until', { mode: 'number' }).notNull(),
  active: boolean('active').notNull().default(true),
  /** Everyone who signs up between valid_from and valid_until gets a code under this offer. */
  auto_issue: boolean('auto_issue').notNull().default(false),
  note: text('note'),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});

/** One caregiver's "remind me to check this child's routines" choice; no row = the default (weekly, 7 pm). every_days 0 = off. */
export const review_reminders = pgTable(
  'review_reminders',
  {
    user_id: uuid('user_id').notNull(),
    profile_id: uuid('profile_id').notNull(),
    every_days: integer('every_days').notNull().default(7),
    hour: integer('hour').notNull().default(19),
    last_sent_at: bigint('last_sent_at', { mode: 'number' }),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.profile_id] })],
);
