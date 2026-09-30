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
