import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type {
  CommunityMediaKind,
  PostKind,
  PostStatus,
  ReportReason,
  ReportStatus,
} from '@chipperly/shared/schemas/community';

/** Column `users.is_support` (migration 0026), mapped alone so accounts.ts stays untouched. */
export const community_profiles = pgTable(
  'community_profiles',
  {
    user_id: uuid('user_id').primaryKey(),
    nickname: text('nickname').notNull(),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [uniqueIndex('community_profiles_nickname_lower').on(sql`lower(${t.nickname})`)],
);

export const community_posts = pgTable(
  'community_posts',
  {
    id: uuid('id').primaryKey(),
    author_user_id: uuid('author_user_id').notNull(),
    author_profile_id: uuid('author_profile_id'),
    kind: text('kind').$type<PostKind>().notNull(),
    title: text('title'),
    body: text('body'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    include_audio: boolean('include_audio').notNull().default(false),
    status: text('status').$type<PostStatus>().notNull().default('published'),
    /** Both null = free. Integer minor units + lowercase ISO code (migration 0029 checks they come together). */
    price_amount: integer('price_amount'),
    price_currency: text('price_currency'),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    updated_at: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('community_posts_feed').on(t.status, t.created_at.desc())],
);

export const community_media = pgTable('community_media', {
  id: uuid('id').primaryKey(),
  post_id: uuid('post_id').notNull(),
  media_id: uuid('media_id').notNull(),
  kind: text('kind').$type<CommunityMediaKind>().notNull(),
  position: integer('position').notNull(),
});

export const community_comments = pgTable(
  'community_comments',
  {
    id: uuid('id').primaryKey(),
    post_id: uuid('post_id').notNull(),
    author_user_id: uuid('author_user_id').notNull(),
    author_profile_id: uuid('author_profile_id'),
    body: text('body').notNull(),
    status: text('status').$type<PostStatus>().notNull().default('published'),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('community_comments_post').on(t.post_id, t.created_at)],
);

export const community_reports = pgTable(
  'community_reports',
  {
    id: uuid('id').primaryKey(),
    target_type: text('target_type').$type<'post' | 'comment'>().notNull(),
    target_id: uuid('target_id').notNull(),
    reporter_user_id: uuid('reporter_user_id').notNull(),
    reason: text('reason').$type<ReportReason>().notNull(),
    note: text('note'),
    status: text('status').$type<ReportStatus>().notNull().default('open'),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    resolved_by: uuid('resolved_by'),
    resolved_at: bigint('resolved_at', { mode: 'number' }),
  },
  (t) => [index('community_reports_status').on(t.status, t.created_at)],
);

/** A seller's Stripe Connect Express account. Flags are kept in step by `account.updated` and a live read. */
export const community_sellers = pgTable(
  'community_sellers',
  {
    user_id: uuid('user_id').primaryKey(),
    stripe_account_id: text('stripe_account_id').notNull(),
    details_submitted: boolean('details_submitted').notNull().default(false),
    charges_enabled: boolean('charges_enabled').notNull().default(false),
    payouts_enabled: boolean('payouts_enabled').notNull().default(false),
    /** Stripe `event.created` (ms) of the last event applied; an older one arriving late is ignored. */
    last_event_at: bigint('last_event_at', { mode: 'number' }).notNull().default(0),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    updated_at: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [uniqueIndex('community_sellers_stripe_account').on(t.stripe_account_id)],
);

export type PurchaseStatus = 'pending' | 'paid';

/**
 * Who bought what. `pending` is written when Checkout starts, `paid` only by the
 * verified webhook. The unique (post, buyer) index is what stops a second charge.
 */
export const community_purchases = pgTable(
  'community_purchases',
  {
    id: uuid('id').primaryKey(),
    post_id: uuid('post_id').notNull(),
    buyer_user_id: uuid('buyer_user_id').notNull(),
    seller_user_id: uuid('seller_user_id').notNull(),
    status: text('status').$type<PurchaseStatus>().notNull().default('pending'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    application_fee_amount: integer('application_fee_amount').notNull().default(0),
    stripe_session_id: text('stripe_session_id'),
    stripe_payment_intent_id: text('stripe_payment_intent_id'),
    created_at: bigint('created_at', { mode: 'number' }).notNull(),
    paid_at: bigint('paid_at', { mode: 'number' }),
  },
  (t) => [
    uniqueIndex('community_purchases_post_buyer').on(t.post_id, t.buyer_user_id),
    uniqueIndex('community_purchases_session').on(t.stripe_session_id),
    index('community_purchases_buyer').on(t.buyer_user_id, t.status),
  ],
);
