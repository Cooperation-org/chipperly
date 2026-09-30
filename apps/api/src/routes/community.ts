import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, inArray, sql as drizzleSql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import {
  CreateCommentBodySchema,
  CreatePostBodySchema,
  CreateReportBodySchema,
  PostKindSchema,
  ReportStatusSchema,
  ResolveReportBodySchema,
  SetNicknameBodySchema,
  UpdatePostBodySchema,
  type CommunityComment,
  type CommunityPost,
  type CommunityProfile,
  type CommunityReport,
  type FeedResponse,
} from '@chipperly/shared/schemas/community';
import { db } from '../db/client.js';
import { account_members, users } from '../db/schema/accounts.js';
import { profiles } from '../db/schema/profiles.js';
import { media } from '../db/schema/media.js';
import {
  community_comments,
  community_media,
  community_posts,
  community_profiles,
  community_reports,
} from '../db/schema/community.js';
import { isSuperAdmin } from '../lib/trial.js';
import { canModerate } from '../lib/moderation.js';
import { canAccessProfile, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

const MAX_PAYLOAD_BYTES = 256 * 1024;

/** Per user per hour; @fastify/rate-limit is opt-in per route (see app.ts). */
function hourly(max: number) {
  return {
    rateLimit: {
      max: process.env.TEST_ENDPOINTS === '1' ? 1000 : max,
      timeWindow: '1 hour',
      keyGenerator: (request: FastifyRequest): string => request.user?.id ?? request.ip,
    },
  };
}

function uid(request: FastifyRequest): string {
  if (!request.user) throw new AppError(401, 'unauthorized', 'Sign-in required');
  return request.user.id;
}

/** Server-side gate: a child-locked session cannot post or comment. request.locked comes from the session row. */
function assertNotLocked(request: FastifyRequest): void {
  if (request.locked) throw new AppError(403, 'device_locked', 'Enter the team PIN to use the community');
}

async function nicknameOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ nickname: community_profiles.nickname })
    .from(community_profiles)
    .where(eq(community_profiles.user_id, userId))
    .limit(1);
  return row?.nickname ?? null;
}

async function requireNickname(userId: string): Promise<void> {
  if ((await nicknameOf(userId)) === null) {
    throw new AppError(409, 'nickname_required', 'Choose a community nickname first');
  }
}

async function assertOwnProfile(userId: string, profileId: string | undefined): Promise<void> {
  if (profileId && !(await canAccessProfile(userId, profileId))) {
    throw new AppError(403, 'forbidden', 'Not your profile');
  }
}

/** Reads the flags from the DB; `is_support` lives in a column UserPublic does not expose yet. */
async function moderatorFlags(userId: string): Promise<{ is_super_admin: boolean; is_support: boolean }> {
  const [row] = await db
    .select({ email: users.email, is_support: users.is_support })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { is_super_admin: row ? isSuperAdmin(row.email) : false, is_support: row?.is_support ?? false };
}

async function isModerator(request: FastifyRequest): Promise<boolean> {
  return request.user ? canModerate(await moderatorFlags(request.user.id)) : false;
}

async function requireModerator(request: FastifyRequest): Promise<string> {
  const id = uid(request);
  if (!canModerate(await moderatorFlags(id))) throw new AppError(403, 'forbidden', 'Moderators only');
  return id;
}

/** Everything a person could be recognised by: profile names on their accounts, display name, email local part. */
async function privateNamesOf(userId: string): Promise<Set<string>> {
  const [me] = await db.select({ email: users.email, display_name: users.display_name }).from(users).where(eq(users.id, userId)).limit(1);
  const names = await db
    .select({ name: profiles.name })
    .from(account_members)
    .innerJoin(profiles, eq(profiles.account_id, account_members.account_id))
    .where(eq(account_members.user_id, userId));
  const out = new Set(names.map((n) => n.name.trim().toLowerCase()));
  if (me) {
    out.add(me.display_name.trim().toLowerCase());
    out.add((me.email.split('@')[0] ?? '').toLowerCase());
  }
  return out;
}

/** Public GETs are cacheable; a signed-in caller may see moderator-only rows, so theirs are not. */
function cacheHeader(request: FastifyRequest, reply: FastifyReply): void {
  reply.header('Cache-Control', request.user ? 'private, no-store' : 'public, max-age=30');
}

const postSelect = {
  id: community_posts.id,
  kind: community_posts.kind,
  title: community_posts.title,
  body: community_posts.body,
  payload: community_posts.payload,
  include_audio: community_posts.include_audio,
  status: community_posts.status,
  created_at: community_posts.created_at,
  updated_at: community_posts.updated_at,
  nickname: community_profiles.nickname,
  is_support: users.is_support,
};

function postQuery() {
  return db
    .select(postSelect)
    .from(community_posts)
    .innerJoin(community_profiles, eq(community_profiles.user_id, community_posts.author_user_id))
    .innerJoin(users, eq(users.id, community_posts.author_user_id));
}

type PostRow = Awaited<ReturnType<typeof postQuery>>[number];

/** Field-by-field on purpose: nothing private can ride along by accident. */
async function toPosts(rows: PostRow[]): Promise<CommunityPost[]> {
  if (rows.length === 0) return [];
  const mediaRows = await db
    .select({
      post_id: community_media.post_id,
      media_id: community_media.media_id,
      kind: community_media.kind,
      position: community_media.position,
    })
    .from(community_media)
    .where(inArray(community_media.post_id, rows.map((r) => r.id)))
    .orderBy(asc(community_media.position));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    payload: r.payload,
    include_audio: r.include_audio,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: { nickname: r.nickname, is_support: r.is_support },
    media: mediaRows
      .filter((m) => m.post_id === r.id)
      .map((m) => ({ media_id: m.media_id, kind: m.kind, position: m.position })),
  }));
}

function encodeCursor(row: { created_at: number; id: string }): string {
  return Buffer.from(`${row.created_at}.${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { created_at: number; id: string } {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString().split('.');
  const parsedId = uuidSchema.safeParse(id);
  const at = Number(ms);
  if (!parsedId.success || !Number.isSafeInteger(at)) throw new AppError(400, 'invalid_cursor', 'Bad cursor');
  return { created_at: at, id: parsedId.data };
}

const FeedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  kind: PostKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const idParamSchema = z.object({ id: uuidSchema });

export default async function communityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/community/feed', async (request, reply): Promise<FeedResponse> => {
    const query = FeedQuerySchema.parse(request.query);
    const conditions: SQL[] = [eq(community_posts.status, 'published')];
    if (query.kind) conditions.push(eq(community_posts.kind, query.kind));
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      conditions.push(drizzleSql`(${community_posts.created_at}, ${community_posts.id}) < (${c.created_at}::bigint, ${c.id}::uuid)`);
    }
    const rows = await postQuery()
      .where(and(...conditions))
      .orderBy(desc(community_posts.created_at), desc(community_posts.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    cacheHeader(request, reply);
    return {
      posts: await toPosts(page),
      next_cursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  });

  app.get('/community/posts/:id', async (request, reply): Promise<CommunityPost> => {
    const { id } = idParamSchema.parse(request.params);
    const [row] = await postQuery().where(eq(community_posts.id, id)).limit(1);
    if (!row || (row.status !== 'published' && !(await isModerator(request)))) {
      throw new AppError(404, 'not_found', 'Post not found');
    }
    cacheHeader(request, reply);
    const [post] = await toPosts([row]);
    if (!post) throw new AppError(404, 'not_found', 'Post not found');
    return post;
  });

  app.get('/community/posts/:id/comments', async (request, reply): Promise<{ comments: CommunityComment[] }> => {
    const { id } = idParamSchema.parse(request.params);
    const rows = await db
      .select({
        id: community_comments.id,
        post_id: community_comments.post_id,
        body: community_comments.body,
        status: community_comments.status,
        created_at: community_comments.created_at,
        nickname: community_profiles.nickname,
        is_support: users.is_support,
      })
      .from(community_comments)
      .innerJoin(community_profiles, eq(community_profiles.user_id, community_comments.author_user_id))
      .innerJoin(users, eq(users.id, community_comments.author_user_id))
      .where(and(eq(community_comments.post_id, id), eq(community_comments.status, 'published')))
      .orderBy(asc(community_comments.created_at))
      .limit(200);
    cacheHeader(request, reply);
    return {
      comments: rows.map((r) => ({
        id: r.id,
        post_id: r.post_id,
        body: r.body,
        status: r.status,
        created_at: r.created_at,
        author: { nickname: r.nickname, is_support: r.is_support },
      })),
    };
  });

  app.get('/community/me', { preHandler: requireUser }, async (request): Promise<CommunityProfile> => {
    return { nickname: await nicknameOf(uid(request)) };
  });

  app.put('/community/me/nickname', { preHandler: requireUser }, async (request): Promise<CommunityProfile> => {
    const userId = uid(request);
    const { nickname } = SetNicknameBodySchema.parse(request.body);

    if ((await nicknameOf(userId)) !== null) {
      throw new AppError(409, 'nickname_already_set', 'Your nickname is already chosen and cannot be changed');
    }
    if ((await privateNamesOf(userId)).has(nickname.toLowerCase())) {
      throw new AppError(400, 'nickname_not_allowed', 'Pick a name that is not a real name or your email');
    }
    const [taken] = await db
      .select({ user_id: community_profiles.user_id })
      .from(community_profiles)
      .where(drizzleSql`lower(${community_profiles.nickname}) = ${nickname.toLowerCase()}`)
      .limit(1);
    if (taken) throw new AppError(409, 'nickname_taken', 'That nickname is taken');

    try {
      await db.insert(community_profiles).values({ user_id: userId, nickname, created_at: Date.now() });
    } catch (error) {
      // A concurrent request won: report which rule it broke instead of a 500.
      if ((await nicknameOf(userId)) !== null) {
        throw new AppError(409, 'nickname_already_set', 'Your nickname is already chosen and cannot be changed');
      }
      const [now] = await db
        .select({ user_id: community_profiles.user_id })
        .from(community_profiles)
        .where(drizzleSql`lower(${community_profiles.nickname}) = ${nickname.toLowerCase()}`)
        .limit(1);
      if (now) throw new AppError(409, 'nickname_taken', 'That nickname is taken');
      throw error;
    }
    return { nickname };
  });

  app.post(
    '/community/posts',
    { preHandler: requireUser, config: hourly(10) },
    async (request, reply): Promise<CommunityPost> => {
      const userId = uid(request);
      assertNotLocked(request);
      const body = CreatePostBodySchema.parse(request.body);
      await requireNickname(userId);
      await assertOwnProfile(userId, body.author_profile_id);

      if (body.payload && Buffer.byteLength(JSON.stringify(body.payload)) > MAX_PAYLOAD_BYTES) {
        throw new AppError(413, 'payload_too_large', 'Shared item is too large');
      }
      // Audio only goes out when the sharer chose it.
      const attachments = body.media.filter((m) => m.kind !== 'audio' || body.include_audio);
      if (attachments.length > 0) {
        const owned = await db
          .select({ id: media.id, kind: media.kind })
          .from(media)
          .where(and(inArray(media.id, attachments.map((m) => m.media_id)), eq(media.created_by, userId)));
        const kindById = new Map(owned.map((m) => [m.id, m.kind]));
        if (attachments.some((m) => kindById.get(m.media_id) !== m.kind)) {
          throw new AppError(400, 'invalid_media', 'Attached media not found');
        }
      }

      const id = uuidv7();
      const now = Date.now();
      await db.transaction(async (tx) => {
        await tx.insert(community_posts).values({
          id,
          author_user_id: userId,
          author_profile_id: body.author_profile_id ?? null,
          kind: body.kind,
          title: body.title ?? null,
          body: body.body ?? null,
          payload: body.payload ?? null,
          include_audio: body.include_audio,
          status: 'published',
          created_at: now,
          updated_at: now,
        });
        if (attachments.length > 0) {
          await tx.insert(community_media).values(
            attachments.map((m, position) => ({ id: uuidv7(), post_id: id, media_id: m.media_id, kind: m.kind, position })),
          );
        }
      });

      const [row] = await postQuery().where(eq(community_posts.id, id)).limit(1);
      const [post] = row ? await toPosts([row]) : [];
      if (!post) throw new AppError(500, 'internal', 'Post not saved');
      reply.code(201);
      return post;
    },
  );

  app.patch('/community/posts/:id', { preHandler: requireUser }, async (request): Promise<CommunityPost> => {
    const userId = uid(request);
    const { id } = idParamSchema.parse(request.params);
    const body = UpdatePostBodySchema.parse(request.body);
    const [existing] = await db
      .select({ author_user_id: community_posts.author_user_id, status: community_posts.status })
      .from(community_posts)
      .where(eq(community_posts.id, id))
      .limit(1);
    if (!existing || existing.status === 'removed') throw new AppError(404, 'not_found', 'Post not found');
    if (existing.author_user_id !== userId) throw new AppError(403, 'forbidden', 'Not your post');

    await db
      .update(community_posts)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        updated_at: Date.now(),
      })
      .where(eq(community_posts.id, id));
    const [row] = await postQuery().where(eq(community_posts.id, id)).limit(1);
    const [post] = row ? await toPosts([row]) : [];
    if (!post) throw new AppError(404, 'not_found', 'Post not found');
    return post;
  });

  app.delete('/community/posts/:id', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const userId = uid(request);
    const { id } = idParamSchema.parse(request.params);
    const [existing] = await db
      .select({ author_user_id: community_posts.author_user_id })
      .from(community_posts)
      .where(eq(community_posts.id, id))
      .limit(1);
    if (!existing) throw new AppError(404, 'not_found', 'Post not found');
    if (existing.author_user_id !== userId && !(await isModerator(request))) {
      throw new AppError(403, 'forbidden', 'Not your post');
    }
    await db.update(community_posts).set({ status: 'removed', updated_at: Date.now() }).where(eq(community_posts.id, id));
    return { ok: true };
  });

  app.post(
    '/community/posts/:id/comments',
    { preHandler: requireUser, config: hourly(30) },
    async (request, reply): Promise<CommunityComment> => {
      const userId = uid(request);
      assertNotLocked(request);
      const { id } = idParamSchema.parse(request.params);
      const body = CreateCommentBodySchema.parse(request.body);
      const nickname = await nicknameOf(userId);
      if (nickname === null) throw new AppError(409, 'nickname_required', 'Choose a community nickname first');
      await assertOwnProfile(userId, body.author_profile_id);

      const [post] = await db
        .select({ id: community_posts.id })
        .from(community_posts)
        .where(and(eq(community_posts.id, id), eq(community_posts.status, 'published')))
        .limit(1);
      if (!post) throw new AppError(404, 'not_found', 'Post not found');

      const commentId = uuidv7();
      const now = Date.now();
      await db.insert(community_comments).values({
        id: commentId,
        post_id: id,
        author_user_id: userId,
        author_profile_id: body.author_profile_id ?? null,
        body: body.body,
        status: 'published',
        created_at: now,
      });
      const [support] = await db.select({ is_support: users.is_support }).from(users).where(eq(users.id, userId)).limit(1);
      reply.code(201);
      return {
        id: commentId,
        post_id: id,
        body: body.body,
        status: 'published',
        created_at: now,
        author: { nickname, is_support: support?.is_support ?? false },
      };
    },
  );

  app.delete('/community/comments/:id', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const userId = uid(request);
    const { id } = idParamSchema.parse(request.params);
    const [existing] = await db
      .select({ author_user_id: community_comments.author_user_id })
      .from(community_comments)
      .where(eq(community_comments.id, id))
      .limit(1);
    if (!existing) throw new AppError(404, 'not_found', 'Comment not found');
    if (existing.author_user_id !== userId && !(await isModerator(request))) {
      throw new AppError(403, 'forbidden', 'Not your comment');
    }
    await db.update(community_comments).set({ status: 'removed' }).where(eq(community_comments.id, id));
    return { ok: true };
  });

  app.post(
    '/community/reports',
    { preHandler: requireUser, config: hourly(20) },
    async (request, reply): Promise<{ ok: true }> => {
      const userId = uid(request);
      const body = CreateReportBodySchema.parse(request.body);
      const [target] =
        body.target_type === 'post'
          ? await db
              .select({ id: community_posts.id })
              .from(community_posts)
              .where(and(eq(community_posts.id, body.target_id), eq(community_posts.status, 'published')))
              .limit(1)
          : await db
              .select({ id: community_comments.id })
              .from(community_comments)
              .where(and(eq(community_comments.id, body.target_id), eq(community_comments.status, 'published')))
              .limit(1);
      if (!target) throw new AppError(404, 'not_found', 'Nothing to report');

      await db.insert(community_reports).values({
        id: uuidv7(),
        target_type: body.target_type,
        target_id: body.target_id,
        reporter_user_id: userId,
        reason: body.reason,
        note: body.note ?? null,
        status: 'open',
        created_at: Date.now(),
      });
      reply.code(201);
      return { ok: true };
    },
  );

  app.get(
    '/community/moderation/reports',
    { preHandler: requireUser },
    async (request): Promise<{ reports: CommunityReport[] }> => {
      await requireModerator(request);
      const { status } = z.object({ status: ReportStatusSchema.default('open') }).parse(request.query);
      const rows = await db
        .select({
          id: community_reports.id,
          target_type: community_reports.target_type,
          target_id: community_reports.target_id,
          reason: community_reports.reason,
          note: community_reports.note,
          status: community_reports.status,
          created_at: community_reports.created_at,
          resolved_at: community_reports.resolved_at,
        })
        .from(community_reports)
        .where(eq(community_reports.status, status))
        .orderBy(asc(community_reports.created_at))
        .limit(200);

      const postIds = rows.filter((r) => r.target_type === 'post').map((r) => r.target_id);
      const commentIds = rows.filter((r) => r.target_type === 'comment').map((r) => r.target_id);
      const posts =
        postIds.length === 0
          ? []
          : await db
              .select({
                id: community_posts.id,
                title: community_posts.title,
                body: community_posts.body,
                status: community_posts.status,
                nickname: community_profiles.nickname,
              })
              .from(community_posts)
              .leftJoin(community_profiles, eq(community_profiles.user_id, community_posts.author_user_id))
              .where(inArray(community_posts.id, postIds));
      const comments =
        commentIds.length === 0
          ? []
          : await db
              .select({
                id: community_comments.id,
                body: community_comments.body,
                status: community_comments.status,
                nickname: community_profiles.nickname,
              })
              .from(community_comments)
              .leftJoin(community_profiles, eq(community_profiles.user_id, community_comments.author_user_id))
              .where(inArray(community_comments.id, commentIds));
      const postById = new Map(posts.map((p) => [p.id, p]));
      const commentById = new Map(comments.map((c) => [c.id, c]));

      return {
        reports: rows.map((r) => {
          const p = r.target_type === 'post' ? postById.get(r.target_id) : undefined;
          const c = r.target_type === 'comment' ? commentById.get(r.target_id) : undefined;
          return {
            ...r,
            target: p
              ? { title: p.title, body: p.body, status: p.status, author_nickname: p.nickname }
              : c
                ? { title: null, body: c.body, status: c.status, author_nickname: c.nickname }
                : null,
          };
        }),
      };
    },
  );

  app.post(
    '/community/moderation/reports/:id/resolve',
    { preHandler: requireUser },
    async (request): Promise<{ ok: true; status: 'actioned' | 'dismissed' }> => {
      const moderatorId = await requireModerator(request);
      const { id } = idParamSchema.parse(request.params);
      const body = ResolveReportBodySchema.parse(request.body);
      const [report] = await db.select().from(community_reports).where(eq(community_reports.id, id)).limit(1);
      if (!report) throw new AppError(404, 'not_found', 'Report not found');
      if (report.status !== 'open') throw new AppError(409, 'already_resolved', 'Report already resolved');

      const now = Date.now();
      const status = body.action === 'dismiss' ? 'dismissed' : 'actioned';
      await db.transaction(async (tx) => {
        if (body.action !== 'dismiss') {
          const next = body.action === 'hide' ? 'hidden' : 'removed';
          if (report.target_type === 'post') {
            await tx.update(community_posts).set({ status: next, updated_at: now }).where(eq(community_posts.id, report.target_id));
          } else {
            await tx.update(community_comments).set({ status: next }).where(eq(community_comments.id, report.target_id));
          }
        }
        await tx
          .update(community_reports)
          .set({ status, resolved_by: moderatorId, resolved_at: now })
          .where(eq(community_reports.id, id));
      });
      return { ok: true, status };
    },
  );
}
