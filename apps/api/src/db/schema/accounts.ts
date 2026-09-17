import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import type { AccountKind, Role } from '@chipperly/shared/schemas/account';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  kind: text('kind').$type<AccountKind>().notNull(),
  name: text('name').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
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
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
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
