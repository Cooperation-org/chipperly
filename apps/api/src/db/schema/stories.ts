import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { syncColumns } from './_sync.js';

export const social_stories = pgTable(
  'social_stories',
  {
    ...syncColumns(),
    title: text('title').notNull(),
    emoji: text('emoji'),
    cover_photo_id: uuid('cover_photo_id'),
    position: integer('position').notNull(),
  },
  (t) => [index('social_stories_profile_version_idx').on(t.profile_id, t.version)],
);

export const story_pages = pgTable(
  'story_pages',
  {
    ...syncColumns(),
    story_id: uuid('story_id').notNull(),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    emoji: text('emoji'),
    photo_id: uuid('photo_id'),
    /** A recorded voice for the page (media kind 'audio'). Migration 0021. */
    audio_id: uuid('audio_id'),
  },
  (t) => [index('story_pages_profile_version_idx').on(t.profile_id, t.version)],
);
