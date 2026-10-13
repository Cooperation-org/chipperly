import { bigint, boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { SubscriptionStatus } from '@chipperly/shared/schemas/billing';

/** One Stripe subscription per account, kept in step by the webhook (routes/billing.ts). */
export const subscriptions = pgTable('subscriptions', {
  account_id: uuid('account_id').primaryKey(),
  stripe_customer_id: text('stripe_customer_id').notNull(),
  stripe_subscription_id: text('stripe_subscription_id').notNull(),
  status: text('status').$type<SubscriptionStatus>().notNull(),
  current_period_end: bigint('current_period_end', { mode: 'number' }),
  cancel_at_period_end: boolean('cancel_at_period_end').notNull().default(false),
  /** Stripe `event.created` (ms) of the last event applied; an older event arriving late is ignored. */
  last_event_at: bigint('last_event_at', { mode: 'number' }).notNull(),
  updated_at: bigint('updated_at', { mode: 'number' }).notNull(),
});

/**
 * Every webhook event that passed the signature check. The primary key is the
 * idempotency guard; the last three columns are only for the super admin's
 * payments log (what the app did with it, and for which account).
 */
export const stripe_events = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  received_at: bigint('received_at', { mode: 'number' }).notNull(),
  result: text('result'),
  account_id: uuid('account_id'),
  status: text('status'),
  /** Free text for the log, e.g. a dispute's amount and reason. */
  detail: text('detail'),
});

/** One payment link or invoice a super admin made for an organization (admin site, migration 0041). */
export const org_billing = pgTable('org_billing', {
  id: uuid('id').primaryKey(),
  account_id: uuid('account_id').notNull(),
  method: text('method').$type<'link' | 'invoice'>().notNull(),
  tier: text('tier').notNull(),
  seats: integer('seats').notNull(),
  yearly_cents: integer('yearly_cents').notNull(),
  currency: text('currency').notNull(),
  stripe_price_id: text('stripe_price_id'),
  stripe_payment_link_id: text('stripe_payment_link_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  url: text('url'),
  billing_email: text('billing_email'),
  /** open | paid | deactivated | void */
  status: text('status').notNull(),
  note: text('note').notNull().default(''),
  created_by: text('created_by').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});

/** What admins did that touched money or data: refunds, cancels, org billing, support role changes. */
export const admin_actions = pgTable('admin_actions', {
  id: uuid('id').primaryKey(),
  at: bigint('at', { mode: 'number' }).notNull(),
  admin_email: text('admin_email').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  detail: text('detail').notNull().default(''),
});
