import { bigint, boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { FeedbackKind, FeedbackStatus } from '@chipperly/shared/schemas/feedback';

/** What beta testers tell us from inside the app (routes/feedback.ts). `user_id` is null for a guest. */
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
  user_id: uuid('user_id'),
  kind: text('kind').$type<FeedbackKind>().notNull(),
  message: text('message').notNull(),
  rating: integer('rating'),
  /** Only kept when they ticked "you may write back": their account email, or the one a guest typed. */
  contact_email: text('contact_email'),
  page: text('page'),
  app_version: text('app_version'),
  user_agent: text('user_agent'),
  account_kind: text('account_kind'),
  price_bargain: integer('price_bargain'),
  price_expensive: integer('price_expensive'),
  price_too_expensive: integer('price_too_expensive'),
  status: text('status').$type<FeedbackStatus>().notNull().default('new'),
  /** True when the person ticked "you may write back". */
  contact_ok: boolean('contact_ok').notNull().default(false),
});
