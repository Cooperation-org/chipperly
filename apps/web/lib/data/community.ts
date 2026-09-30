'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  CommentsResponseSchema,
  CommunityCommentSchema,
  CommunityPostSchema,
  FeedResponseSchema,
  SellerStatusSchema,
  StripeUrlResponseSchema,
  type Price,
  type SellerStatus,
} from '@chipperly/shared/schemas/community';
import { api, ApiError } from '../api/client';
import { useOnline } from '../device/online';
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

/** Appends a fetched page, dropping any item already shown (a new item shifts the cursor window). */
export function mergeById<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

export function appendPage(prev: FeedPages, page: FeedPages): FeedPages {
  return { posts: mergeById(prev.posts, page.posts), next_cursor: page.next_cursor };
}

// ---- what the viewer may do (decided by the API, never by comparing names) ----

export interface ViewerFlags {
  is_mine: boolean;
  can_moderate: boolean;
}

/** Author, or a moderator (who removes it). */
export const canDelete = (v: ViewerFlags): boolean => v.is_mine || v.can_moderate;
/** Only the author edits: the API's PATCH refuses everyone else. */
export const canEdit = (v: ViewerFlags): boolean => v.is_mine;

// ---- prices ----
// Amounts travel as integer minor units. Nothing here knows a currency or a price:
// the seller types both, and Intl says how many decimals the currency has.

export function minorUnitDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "4.99" or "4,99" -> 499 for a two-decimal currency. Null for anything that is not a positive amount with allowed decimals. */
export function toMinorUnits(text: string, currency: string): number | null {
  const digits = minorUnitDigits(currency);
  const m = /^(\d{1,8})(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) return null;
  const fraction = m[2] ?? '';
  if (fraction.length > digits) return null;
  const minor = Number(`${m[1]}${fraction.padEnd(digits, '0')}`);
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 99_999_999 ? minor : null;
}

export function formatPrice(price: Price): string {
  const digits = minorUnitDigits(price.currency);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(price.amount / 10 ** digits);
  } catch {
    return `${(price.amount / 10 ** digits).toFixed(digits)} ${price.currency.toUpperCase()}`;
  }
}

/** A code the API would accept, lowercased; null while it is not three letters. */
export function normalizeCurrency(text: string): string | null {
  const c = text.trim().toLowerCase();
  return /^[a-z]{3}$/.test(c) ? c : null;
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
  const offline = !useOnline();
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

/**
 * First page through `useOnlineLoad`, further pages on demand. `patch` edits the list
 * in place (a new comment, a deleted item) without refetching. A reload discards
 * everything appended to or patched onto the old first page.
 */
function usePagedList<T extends { id: string }>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; next_cursor: string | null }>,
  key: string,
) {
  const first = useOnlineLoad(
    useCallback(() => fetchPage(null), [fetchPage]),
    key,
  );
  const [extra, setExtra] = useState<{ base: unknown; items: T[]; next_cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const current = first.data ? (extra && extra.base === first.data ? extra : { items: first.data.items, next_cursor: first.data.next_cursor }) : null;

  const loadMore = useCallback(async () => {
    if (!current?.next_cursor || loadingMore || !first.data) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchPage(current.next_cursor);
      setExtra({ base: first.data, items: mergeById(current.items, page.items), next_cursor: page.next_cursor });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [current, first.data, fetchPage, loadingMore]);

  const patch = useCallback(
    (fn: (items: T[], hasMore: boolean) => T[]) => {
      if (!current || !first.data) return;
      setExtra({ base: first.data, items: fn(current.items, current.next_cursor !== null), next_cursor: current.next_cursor });
    },
    [current, first.data],
  );

  return {
    status: first.status,
    items: current?.items ?? [],
    hasMore: Boolean(current?.next_cursor),
    loadingMore,
    moreFailed,
    loadMore,
    patch,
    reload: first.reload,
  };
}

export function useFeed(kind?: PostKind) {
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const page = await fetchFeed(kind, cursor);
      return { items: page.posts, next_cursor: page.next_cursor };
    },
    [kind],
  );
  const r = usePagedList(fetchPage, kind ?? 'all');
  return {
    status: r.status,
    posts: r.items,
    hasMore: r.hasMore,
    loadingMore: r.loadingMore,
    moreFailed: r.moreFailed,
    loadMore: r.loadMore,
    remove: (id: string) => r.patch((items) => items.filter((p) => p.id !== id)),
    reload: r.reload,
  };
}

export function usePost(id: string) {
  const load = useCallback(() => api.get<CommunityPost>(`/community/posts/${id}`, { schema: CommunityPostSchema }), [id]);
  const r = useOnlineLoad(load, id);
  return { status: r.status, post: r.data, reload: r.reload };
}

export function commentsPath(postId: string, cursor: string | null): string {
  const base = `/community/posts/${postId}/comments`;
  return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
}

export function useComments(postId: string) {
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const page = await api.get<z.infer<typeof CommentsResponseSchema>>(commentsPath(postId, cursor), {
        schema: CommentsResponseSchema,
      });
      return { items: page.comments, next_cursor: page.next_cursor };
    },
    [postId],
  );
  const r = usePagedList(fetchPage, postId);
  return {
    status: r.status,
    comments: r.items,
    hasMore: r.hasMore,
    loadingMore: r.loadingMore,
    moreFailed: r.moreFailed,
    loadMore: r.loadMore,
    /** A new comment goes on the end of the list, but only once the last page is showing; otherwise it arrives with its page. */
    added: (c: CommunityComment) => r.patch((items, hasMore) => (hasMore ? items : mergeById(items, [c]))),
    removed: (id: string) => r.patch((items) => items.filter((c) => c.id !== id)),
    reload: r.reload,
  };
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
  /** Omitted = free. */
  price?: Price;
}

/** The API's optional fields are absent, not null: `title: null` would be a 400. */
export function omitNull<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

/** Media is queued locally first; it has to be on the server before the post points at it. */
export async function createPost(input: CreatePostInput): Promise<CommunityPost> {
  if (input.media.length > 0) await uploadPending();
  const body = omitNull({ ...input, media: input.media.map((m, position) => ({ ...m, position })) });
  return api.post<CommunityPost>('/community/posts', body, { schema: CommunityPostSchema });
}

export function addComment(postId: string, body: string, authorProfileId?: string | null): Promise<CommunityComment> {
  return api.post<CommunityComment>(
    `/community/posts/${postId}/comments`,
    omitNull({ body, author_profile_id: authorProfileId }),
    { schema: CommunityCommentSchema },
  );
}

export function deletePost(id: string): Promise<void> {
  return api.delete<void>(`/community/posts/${id}`);
}

export function deleteComment(id: string): Promise<void> {
  return api.delete<void>(`/community/comments/${id}`);
}

export function editPost(id: string, input: { title: string | null; body: string | null }): Promise<CommunityPost> {
  return api.patch<CommunityPost>(`/community/posts/${id}`, input, { schema: CommunityPostSchema });
}

// ---- selling (all of it absent unless the server has Stripe) ----

/** GET /community/selling. Null while loading and for good when selling is off (404) or nobody is signed in. */
/**
 * `enabled` is false for a signed-out reader: the feed is public, and asking an
 * authenticated route on every anonymous view only logs a failed request.
 */
export function useSellerStatus(enabled = true): { status: SellerStatus | null; reload: () => void } {
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<SellerStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    api
      .get<SellerStatus>('/community/selling', { schema: SellerStatusSchema, signal: ctl.signal })
      .then(setStatus)
      .catch(() => undefined);
    return () => ctl.abort();
  }, [nonce, enabled]);
  return { status, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export async function startSellerOnboarding(): Promise<string> {
  return (await api.post<{ url: string }>('/community/selling/onboarding', undefined, { schema: StripeUrlResponseSchema })).url;
}

export async function startCheckout(postId: string): Promise<string> {
  return (await api.post<{ url: string }>(`/community/posts/${postId}/checkout`, undefined, { schema: StripeUrlResponseSchema })).url;
}

/** Plain words for the two errors a seller or buyer can actually hit. */
export function sellingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'seller_not_onboarded' || err.code === 'fee_not_set') return err.message;
    if (err.code === 'already_purchased') return 'You already own this item.';
    if (err.code === 'seller_unavailable') return "The seller can't take payments right now.";
  }
  return "That didn't work. Check your connection and try again.";
}
