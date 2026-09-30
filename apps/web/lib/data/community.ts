'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  CommunityCommentSchema,
  CommunityPostSchema,
  FeedResponseSchema,
} from '@chipperly/shared/schemas/community';
import { api, ApiError } from '../api/client';
import { useSyncStatus, type SyncState } from '../sync/engine';
import { uploadPending } from './media';
import type { SaveActivityInput } from './activities';
import type { SaveStoryInput } from './stories';

// Community is online-only: nothing here touches Dexie or the sync outbox.

export type CommunityPost = z.infer<typeof CommunityPostSchema>;
export type CommunityComment = z.infer<typeof CommunityCommentSchema>;
export type PostKind = 'post' | 'story' | 'routine';

export interface FeedPages {
  posts: CommunityPost[];
  next_cursor: string | null;
}

/** Appends a fetched page, dropping any post already shown (a new post shifts the cursor window). */
export function appendPage(prev: FeedPages, page: FeedPages): FeedPages {
  const seen = new Set(prev.posts.map((p) => p.id));
  return { posts: [...prev.posts, ...page.posts.filter((p) => !seen.has(p.id))], next_cursor: page.next_cursor };
}

export function isOffline(state: SyncState): boolean {
  return state === 'offline';
}

export function isNicknameRequired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === 'nickname_required';
}

/** Author is only ever a nickname; comparing nicknames is how we know a post is ours. */
export function isMine(author: { nickname: string }, myNickname: string | null | undefined): boolean {
  return Boolean(myNickname) && author.nickname.toLowerCase() === (myNickname ?? '').toLowerCase();
}

// ---- payload snapshots ----

const opt = <T extends z.ZodTypeAny>(s: T) => s.nullable().catch(null);

const StoryPayloadSchema = z.object({
  title: z.string(),
  emoji: opt(z.string()),
  cover_photo_id: opt(z.string()),
  pages: z.array(
    z.object({ text: z.string().catch(''), emoji: opt(z.string()), photo_id: opt(z.string()), audio_id: opt(z.string()) }),
  ),
});
const RoutinePayloadSchema = z.object({
  name: z.string(),
  emoji: opt(z.string()),
  photo_id: opt(z.string()),
  chip_value: z.number().catch(1),
  steps: z.array(
    z.object({
      id: z.string(),
      parent_step_id: opt(z.string()),
      name: z.string(),
      emoji: opt(z.string()),
      photo_id: opt(z.string()),
      duration_minutes: opt(z.number()),
    }),
  ),
});
export type StoryPayload = z.infer<typeof StoryPayloadSchema>;
export type RoutinePayload = z.infer<typeof RoutinePayloadSchema>;

export type ParsedPayload = { kind: 'story'; data: StoryPayload } | { kind: 'routine'; data: RoutinePayload } | null;

export function parsePayload(kind: PostKind, payload: unknown): ParsedPayload {
  if (kind === 'story') {
    const r = StoryPayloadSchema.safeParse(payload);
    return r.success ? { kind, data: r.data } : null;
  }
  if (kind === 'routine') {
    const r = RoutinePayloadSchema.safeParse(payload);
    return r.success ? { kind, data: r.data } : null;
  }
  return null;
}

/** Snapshot of a local story. Audio ids are dropped unless the sharer switched audio on. */
export function storyToPayload(
  story: { title: string; emoji: string | null; cover_photo_id: string | null },
  pages: readonly { text: string; emoji: string | null; photo_id: string | null; audio_id?: string | null }[],
  includeAudio: boolean,
): StoryPayload {
  return {
    title: story.title,
    emoji: story.emoji,
    cover_photo_id: story.cover_photo_id,
    pages: pages.map((p) => ({ text: p.text, emoji: p.emoji, photo_id: p.photo_id, audio_id: includeAudio ? (p.audio_id ?? null) : null })),
  };
}

export function routineToPayload(
  activity: { name: string; emoji: string | null; photo_id: string | null; chip_value: number },
  steps: readonly {
    id: string;
    parent_step_id: string | null;
    name: string;
    emoji: string | null;
    photo_id: string | null;
    duration_minutes: number | null;
    position: number;
  }[],
): RoutinePayload {
  return {
    name: activity.name,
    emoji: activity.emoji,
    photo_id: activity.photo_id,
    chip_value: activity.chip_value,
    steps: [...steps]
      .sort((a, b) => a.position - b.position)
      .map(({ id, parent_step_id, name, emoji, photo_id, duration_minutes }) => ({
        id,
        parent_step_id,
        name,
        emoji,
        photo_id,
        duration_minutes,
      })),
  };
}

/** New rows for the importer: no id from the author survives. */
export function payloadToStoryInput(payload: StoryPayload, profileId: string): SaveStoryInput {
  return {
    profile_id: profileId,
    title: payload.title,
    emoji: payload.emoji,
    cover_photo_id: payload.cover_photo_id,
    pages: payload.pages.map((p) => ({ text: p.text, emoji: p.emoji, photo_id: p.photo_id, audio_id: p.audio_id })),
  };
}

export function payloadToActivityInput(
  payload: RoutinePayload,
  profileId: string,
  makeId: () => string,
): SaveActivityInput {
  const ids = new Map(payload.steps.map((s) => [s.id, makeId()]));
  return {
    profile_id: profileId,
    name: payload.name,
    emoji: payload.emoji,
    photo_id: payload.photo_id,
    chip_value: Math.max(0, Math.round(payload.chip_value)),
    location_ids: [],
    recurrence: null,
    recurrence_weekdays: null,
    recurrence_time: null,
    goal_text: null,
    goal_reward_id: null,
    steps: payload.steps.map((s) => ({
      id: ids.get(s.id),
      parent_step_id: s.parent_step_id ? (ids.get(s.parent_step_id) ?? null) : null,
      name: s.name,
      emoji: s.emoji,
      photo_id: s.photo_id,
      duration_minutes: s.duration_minutes,
    })),
  };
}

// ---- what a card needs ----

export interface PostCardModel {
  id: string;
  kind: PostKind;
  title: string;
  excerpt: string;
  nickname: string;
  is_support: boolean;
  created_at: number;
  image_ids: string[];
  has_audio: boolean;
}

const EXCERPT_MAX = 140;

export function toCard(post: CommunityPost): PostCardModel {
  const parsed = parsePayload(post.kind, post.payload);
  const payloadTitle = parsed?.kind === 'story' ? parsed.data.title : parsed?.kind === 'routine' ? parsed.data.name : '';
  const body = (post.body ?? '').trim();
  const media = [...(post.media ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: post.id,
    kind: post.kind,
    title: (post.title ?? '').trim() || payloadTitle,
    excerpt: body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX).trimEnd()}...` : body,
    nickname: post.author.nickname,
    is_support: post.author.is_support,
    created_at: post.created_at,
    image_ids: media.filter((m) => m.kind === 'image').map((m) => m.media_id),
    has_audio: media.some((m) => m.kind === 'audio'),
  };
}

// ---- fetching ----

export type LoadStatus = 'loading' | 'ready' | 'error' | 'offline';

const CommentsSchema = z.union([
  z.array(CommunityCommentSchema),
  z.object({ comments: z.array(CommunityCommentSchema) }).transform((v) => v.comments),
]);

export function feedPath(kind: PostKind | undefined, cursor: string | null): string {
  const q = new URLSearchParams();
  if (cursor) q.set('cursor', cursor);
  if (kind) q.set('kind', kind);
  const s = q.toString();
  return s ? `/community/feed?${s}` : '/community/feed';
}

async function fetchFeed(kind: PostKind | undefined, cursor: string | null): Promise<FeedPages> {
  return api.get<FeedPages>(feedPath(kind, cursor), { schema: FeedResponseSchema });
}

/**
 * Runs `load` whenever `key` changes and we are online; reports 'offline' instead of
 * firing a doomed request. The stored result carries the key it belongs to, so a result
 * for a previous key reads as 'loading' during render. That is why there is no
 * setState in the effect: writing 'loading' there costs a second render pass, and
 * React (and the lint rule) rightly object to it.
 */
function useOnlineLoad<T>(load: () => Promise<T>, key: string) {
  const offline = isOffline(useSyncStatus().state);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; status: 'ready' | 'error'; data: T | null } | null>(null);
  const fullKey = `${key}#${nonce}`;

  useEffect(() => {
    if (offline) return;
    let live = true;
    load().then(
      (data) => {
        if (live) setResult({ key: fullKey, status: 'ready', data });
      },
      () => {
        if (live) setResult({ key: fullKey, status: 'error', data: null });
      },
    );
    return () => {
      live = false;
    };
  }, [load, offline, fullKey]);

  const fresh = result?.key === fullKey ? result : null;
  const status: LoadStatus = offline ? 'offline' : (fresh?.status ?? 'loading');
  return { status, data: fresh?.data ?? null, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function useFeed(kind?: PostKind) {
  const load = useCallback(() => fetchFeed(kind, null), [kind]);
  const first = useOnlineLoad(load, kind ?? 'all');
  const [extra, setExtra] = useState<{ base: FeedPages | null; pages: FeedPages | null }>({ base: null, pages: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  // A reload (new first page object) discards pages that were appended to the old one.
  const current = extra.base === first.data ? (extra.pages ?? first.data) : first.data;

  const loadMore = useCallback(async () => {
    if (!current?.next_cursor || loadingMore || !first.data) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchFeed(kind, current.next_cursor);
      setExtra({ base: first.data, pages: appendPage(current, page) });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [current, first.data, kind, loadingMore]);

  return {
    status: first.status,
    posts: current?.posts ?? [],
    hasMore: Boolean(current?.next_cursor),
    loadingMore,
    moreFailed,
    loadMore,
    reload: first.reload,
  };
}

export function usePost(id: string) {
  const load = useCallback(() => api.get<CommunityPost>(`/community/posts/${id}`, { schema: CommunityPostSchema }), [id]);
  const r = useOnlineLoad(load, id);
  return { status: r.status, post: r.data, reload: r.reload };
}

export function useComments(postId: string) {
  const load = useCallback(
    () => api.get<CommunityComment[]>(`/community/posts/${postId}/comments`, { schema: CommentsSchema }),
    [postId],
  );
  const r = useOnlineLoad(load, postId);
  return { status: r.status, comments: r.data ?? [], reload: r.reload };
}

const MeSchema = z.object({ nickname: z.string().nullable() });

/** Null both for "no nickname yet" and for a signed-out reader (the endpoint needs auth). */
export function useMyNickname(): string | null {
  const load = useCallback(
    () =>
      api
        .get<z.infer<typeof MeSchema>>('/community/me', { schema: MeSchema })
        .then((m) => m.nickname)
        .catch(() => null),
    [],
  );
  return useOnlineLoad(load, 'me').data ?? null;
}

export interface CreatePostInput {
  kind: PostKind;
  title: string | null;
  body: string | null;
  payload: StoryPayload | RoutinePayload | null;
  include_audio: boolean;
  media: { media_id: string; kind: 'image' | 'audio' }[];
  author_profile_id?: string | null;
}

/** Media is queued locally first; it has to be on the server before the post points at it. */
export async function createPost(input: CreatePostInput): Promise<CommunityPost> {
  if (input.media.length > 0) await uploadPending();
  const body = { ...input, media: input.media.map((m, position) => ({ ...m, position })) };
  return api.post<CommunityPost>('/community/posts', body, { schema: CommunityPostSchema });
}

export function addComment(postId: string, body: string, authorProfileId?: string | null): Promise<CommunityComment> {
  return api.post<CommunityComment>(
    `/community/posts/${postId}/comments`,
    { body, author_profile_id: authorProfileId ?? null },
    { schema: CommunityCommentSchema },
  );
}

export function deletePost(id: string): Promise<void> {
  return api.delete<void>(`/community/posts/${id}`);
}

export function deleteComment(id: string): Promise<void> {
  return api.delete<void>(`/community/comments/${id}`);
}
