'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { SocialStory, StoryPage } from '@chipperly/shared/schemas/story';
import { STORY_TEMPLATES, type StoryTemplateKey } from '@chipperly/shared/constants/storyTemplates';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';
import { nextPosition } from './_util';

export function useStories(profileId: string): SocialStory[] {
  const rows = useLiveQuery(() => db.social_stories.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(
    () => rows.filter((row) => row.deleted_at === null).sort((a, b) => a.position - b.position),
    [rows],
  );
}

// No `[]` default on the `pages` liveQuery: that would make "still loading"
// and "genuinely has zero pages" both read as an empty array, and callers
// (StoryForm's hydration effect in particular) need to tell those apart —
// hydrating a draft from a story whose pages just haven't loaded yet would
// wipe the real pages on the next save.
export function useStory(id: string): { story: SocialStory | undefined; pages: StoryPage[] | undefined } {
  const story = useLiveQuery(() => db.social_stories.get(id), [id]);
  const pages = useLiveQuery(() => db.story_pages.where('story_id').equals(id).toArray(), [id]);
  const sortedPages = useMemo(
    () => pages?.filter((page) => page.deleted_at === null).sort((a, b) => a.position - b.position),
    [pages],
  );
  return { story, pages: sortedPages };
}

export interface SaveStoryPageInput {
  id?: string;
  text: string;
  emoji: string | null;
  photo_id: string | null;
}

export interface SaveStoryInput {
  id?: string;
  profile_id: string;
  title: string;
  emoji: string | null;
  cover_photo_id: string | null;
  pages: SaveStoryPageInput[];
}

export async function saveStory(input: SaveStoryInput): Promise<string> {
  const existing = input.id ? await db.social_stories.get(input.id) : undefined;
  const id = input.id ?? newId();
  const position = existing?.position ?? (await nextPosition(db.social_stories, input.profile_id));

  await upsert('social_stories', {
    id,
    profile_id: input.profile_id,
    version: existing?.version ?? 0,
    client_updated_at: now(),
    updated_by: '',
    deleted_at: null,
    title: input.title,
    emoji: input.emoji,
    cover_photo_id: input.cover_photo_id,
    position,
  } satisfies SocialStory);

  const existingPages = await db.story_pages.where('story_id').equals(id).toArray();
  const existingById = new Map(existingPages.map((page) => [page.id, page]));
  const keepIds = new Set(input.pages.filter((page) => page.id).map((page) => page.id as string));

  for (const page of existingPages) {
    if (page.deleted_at === null && !keepIds.has(page.id)) await softDelete('story_pages', page.id);
  }

  for (let i = 0; i < input.pages.length; i += 1) {
    const pageInput = input.pages[i] as SaveStoryPageInput;
    const pageId = pageInput.id ?? newId();
    const priorPage = existingById.get(pageId);
    await upsert('story_pages', {
      id: pageId,
      profile_id: input.profile_id,
      version: priorPage?.version ?? 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      story_id: id,
      position: i,
      text: pageInput.text,
      emoji: pageInput.emoji,
      photo_id: pageInput.photo_id,
    } satisfies StoryPage);
  }

  return id;
}

export async function deleteStory(id: string): Promise<void> {
  await softDelete('social_stories', id);
}

export async function duplicateStory(id: string): Promise<string> {
  const story = await db.social_stories.get(id);
  if (!story) throw new Error('duplicateStory: story not found');
  const pages = (await db.story_pages.where('story_id').equals(id).toArray())
    .filter((page) => page.deleted_at === null)
    .sort((a, b) => a.position - b.position);

  return saveStory({
    profile_id: story.profile_id,
    title: `${story.title} copy`,
    emoji: story.emoji,
    cover_photo_id: story.cover_photo_id,
    pages: pages.map((page) => ({ text: page.text, emoji: page.emoji, photo_id: page.photo_id })),
  });
}

/** S16 empty-state starter templates (haircut, doctor, new place, big day). */
export async function createFromTemplate(profileId: string, templateKey: StoryTemplateKey): Promise<string> {
  const template = STORY_TEMPLATES[templateKey];
  return saveStory({
    profile_id: profileId,
    title: template.title,
    emoji: template.emoji,
    cover_photo_id: null,
    pages: template.pages.map((page) => ({ text: page.text, emoji: page.emoji, photo_id: null })),
  });
}
