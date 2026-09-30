import { bigint, boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
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

/** Every webhook event id already applied. The primary key is the idempotency guard. */
export const stripe_events = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  received_at: bigint('received_at', { mode: 'number' }).notNull(),
});
