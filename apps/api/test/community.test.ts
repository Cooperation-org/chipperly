import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  CommunityCommentSchema,
  CommunityPostSchema,
  FeedResponseSchema,
  type CommunityPost,
} from '@chipperly/shared/schemas/community';
import { buildTestApp, expectShape, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser, type TestUser } from './fixtures.js';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { community_comments, community_posts } from '../src/db/schema/community.js';
import { canModerate } from '../src/lib/moderation.js';

const run = uuidv7().slice(-8);
let counter = 0;
function nick(prefix = 'nick'): string {
  counter += 1;
  return `${prefix}${run}${counter}`;
}

function auth(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

describe('community', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setNickname(user: TestUser, nickname = nick()) {
    const res = await request(app, { method: 'PUT', url: '/api/community/me/nickname', headers: auth(user), payload: { nickname } });
    expect(res.statusCode).toBe(200);
    return nickname;
  }

  async function nicknamedUser(): Promise<{ user: TestUser; nickname: string }> {
    const user = await createUser('Pat Quinn');
    return { user, nickname: await setNickname(user) };
  }

  async function makePost(user: TestUser, payload: Record<string, unknown> = { body: 'hello there' }) {
    return request(app, { method: 'POST', url: '/api/community/posts', headers: auth(user), payload });
  }

  async function makeSupport(user: TestUser): Promise<void> {
    await db.update(users).set({ is_support: true }).where(eq(users.id, user.id));
  }

  describe('nickname', () => {
    it('starts as null and can be set once, never twice', async () => {
      const user = await createUser();
      const before = await request(app, { method: 'GET', url: '/api/community/me', headers: auth(user) });
      expect(before.json()).toEqual({ nickname: null });

      const name = await setNickname(user);
      const again = await request(app, {
        method: 'PUT',
        url: '/api/community/me/nickname',
        headers: auth(user),
        payload: { nickname: nick() },
      });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('nickname_already_set');

      const after = await request(app, { method: 'GET', url: '/api/community/me', headers: auth(user) });
      expect(after.json()).toEqual({ nickname: name });
    });

    it('is unique case-insensitively', async () => {
      const first = await createUser();
      const second = await createUser();
      const name = nick('Dupe');
      await setNickname(first, name);
      const res = await request(app, {
        method: 'PUT',
        url: '/api/community/me/nickname',
        headers: auth(second),
        payload: { nickname: name.toUpperCase() },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('nickname_taken');
    });

    it('rejects a nickname equal to one of the poster\'s profile names, any case', async () => {
      const user = await createUser();
      const accountId = await createAccount(user.id);
      await addMember(accountId, user.id, 'admin');
      await createProfile(accountId, user.id, 'Benny');
      const res = await request(app, {
        method: 'PUT',
        url: '/api/community/me/nickname',
        headers: auth(user),
        payload: { nickname: 'BENNY' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('nickname_not_allowed');
      const me = await request(app, { method: 'GET', url: '/api/community/me', headers: auth(user) });
      expect(me.json()).toEqual({ nickname: null });
    });

    it('rejects a nickname equal to the email local part', async () => {
      const user = await createUser();
      const local = `sunny${run}`;
      await db.update(users).set({ email: `${local}@example.com` }).where(eq(users.id, user.id));
      const res = await request(app, {
        method: 'PUT',
        url: '/api/community/me/nickname',
        headers: auth(user),
        payload: { nickname: local.toUpperCase() },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('nickname_not_allowed');
    });

    it('rejects malformed nicknames and requires sign-in', async () => {
      const user = await createUser();
      const bad = await request(app, {
        method: 'PUT',
        url: '/api/community/me/nickname',
        headers: auth(user),
        payload: { nickname: 'a b' },
      });
      expect(bad.statusCode).toBe(400);
      const anon = await request(app, { method: 'PUT', url: '/api/community/me/nickname', payload: { nickname: nick() } });
      expect(anon.statusCode).toBe(401);
    });
  });

  describe('posting and the feed', () => {
    it('needs a nickname before posting', async () => {
      const user = await createUser();
      const res = await makePost(user);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('nickname_required');
    });

    it('feed is public, published-only, and leaks no private field', async () => {
      const { user, nickname } = await nicknamedUser();
      const accountId = await createAccount(user.id);
      await addMember(accountId, user.id, 'admin');
      const profileId = await createProfile(accountId, user.id, 'Zaphod');

      const visible = await makePost(user, { body: `visible ${run}`, author_profile_id: profileId });
      expect(visible.statusCode).toBe(201);
      const visiblePost = expectShape(visible, CommunityPostSchema);
      const hidden = expectShape(await makePost(user, { body: `hidden ${run}` }), CommunityPostSchema);
      await db.update(community_posts).set({ status: 'hidden' }).where(eq(community_posts.id, hidden.id));

      const feed = await request(app, { method: 'GET', url: '/api/community/feed?limit=50' });
      expect(feed.statusCode).toBe(200);
      const body = expectShape(feed, FeedResponseSchema);
      const ids = body.posts.map((p) => p.id);
      expect(ids).toContain(visiblePost.id);
      expect(ids).not.toContain(hidden.id);
      expect(body.posts.every((p) => p.status === 'published')).toBe(true);

      const mine = body.posts.find((p) => p.id === visiblePost.id);
      expect(mine?.author).toEqual({ nickname, is_support: false });

      const raw = feed.body;
      expect(raw).not.toContain(user.id);
      expect(raw).not.toContain(`${user.id}@example.com`);
      expect(raw).not.toContain('Zaphod');
      expect(raw).not.toContain('Pat Quinn');
      expect(raw).not.toContain(profileId);
      expect(raw).not.toContain('author_user_id');
      expect(raw).not.toContain('author_profile_id');
      expect(feed.headers['cache-control']).toContain('public');
    });

    it('paginates with a cursor', async () => {
      const { user } = await nicknamedUser();
      const a = expectShape(await makePost(user, { body: 'a' }), CommunityPostSchema);
      const b = expectShape(await makePost(user, { body: 'b' }), CommunityPostSchema);
      const page1 = expectShape(await request(app, { method: 'GET', url: '/api/community/feed?limit=1' }), FeedResponseSchema);
      expect(page1.posts).toHaveLength(1);
      expect(page1.next_cursor).not.toBeNull();
      const page2 = expectShape(
        await request(app, { method: 'GET', url: `/api/community/feed?limit=50&cursor=${page1.next_cursor}` }),
        FeedResponseSchema,
      );
      expect(page2.posts.map((p) => p.id)).not.toContain(page1.posts[0]?.id);
      expect(a.id).not.toBe(b.id);
    });

    it('a locked session cannot post or comment', async () => {
      const { user } = await nicknamedUser();
      const post = expectShape(await makePost(user), CommunityPostSchema);
      const accountId = await createAccount(user.id);
      await addMember(accountId, user.id, 'admin');
      const profileId = await createProfile(accountId, user.id);
      const lock = await request(app, { method: 'POST', url: '/api/me/lock', headers: auth(user), payload: { profile_id: profileId } });
      expect(lock.statusCode).toBe(200);

      const blockedPost = await makePost(user, { body: 'should not land' });
      expect(blockedPost.statusCode).toBe(403);
      expect(blockedPost.json().error.code).toBe('device_locked');

      const blockedComment = await request(app, {
        method: 'POST',
        url: `/api/community/posts/${post.id}/comments`,
        headers: auth(user),
        payload: { body: 'nope' },
      });
      expect(blockedComment.statusCode).toBe(403);
      expect(blockedComment.json().error.code).toBe('device_locked');
    });

    it('stores a shared story as a snapshot and drops audio unless include_audio', async () => {
      const { user } = await nicknamedUser();
      const payload = { title: 'Dentist', pages: [{ text: 'Sit in the chair' }] };
      const res = await makePost(user, { kind: 'story', title: 'Dentist', payload });
      expect(res.statusCode).toBe(201);
      const post = expectShape(res, CommunityPostSchema);
      expect(post.include_audio).toBe(false);
      expect(post.payload).toEqual(payload);

      const missing = await makePost(user, { kind: 'routine', title: 'no payload' });
      expect(missing.statusCode).toBe(400);
    });

    it('only the author can edit; author or moderator removes', async () => {
      const { user: author } = await nicknamedUser();
      const { user: other } = await nicknamedUser();
      const post = expectShape(await makePost(author), CommunityPostSchema);

      const foreignEdit = await request(app, {
        method: 'PATCH',
        url: `/api/community/posts/${post.id}`,
        headers: auth(other),
        payload: { body: 'hijack' },
      });
      expect(foreignEdit.statusCode).toBe(403);
      const ownEdit = await request(app, {
        method: 'PATCH',
        url: `/api/community/posts/${post.id}`,
        headers: auth(author),
        payload: { body: 'edited' },
      });
      expect(ownEdit.statusCode).toBe(200);
      expect((ownEdit.json() as CommunityPost).body).toBe('edited');

      const foreignDelete = await request(app, { method: 'DELETE', url: `/api/community/posts/${post.id}`, headers: auth(other) });
      expect(foreignDelete.statusCode).toBe(403);
      const ownDelete = await request(app, { method: 'DELETE', url: `/api/community/posts/${post.id}`, headers: auth(author) });
      expect(ownDelete.statusCode).toBe(200);
      const gone = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}` });
      expect(gone.statusCode).toBe(404);
    });
  });

  describe('comments', () => {
    it('lists published comments with only nickname and is_support as author', async () => {
      const { user: author } = await nicknamedUser();
      const { user: commenter, nickname } = await nicknamedUser();
      const post = expectShape(await makePost(author), CommunityPostSchema);

      const created = await request(app, {
        method: 'POST',
        url: `/api/community/posts/${post.id}/comments`,
        headers: auth(commenter),
        payload: { body: 'nice one' },
      });
      expect(created.statusCode).toBe(201);
      const comment = expectShape(created, CommunityCommentSchema);
      const removed = expectShape(
        await request(app, {
          method: 'POST',
          url: `/api/community/posts/${post.id}/comments`,
          headers: auth(commenter),
          payload: { body: 'gone soon' },
        }),
        CommunityCommentSchema,
      );
      await db.update(community_comments).set({ status: 'removed' }).where(eq(community_comments.id, removed.id));

      const list = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}/comments` });
      expect(list.statusCode).toBe(200);
      const comments = (list.json() as { comments: unknown[] }).comments;
      expect(comments).toHaveLength(1);
      expect(comments[0]).toMatchObject({ id: comment.id, author: { nickname, is_support: false } });
      expect(list.body).not.toContain(commenter.id);
    });

    it('needs a nickname', async () => {
      const { user: author } = await nicknamedUser();
      const post = expectShape(await makePost(author), CommunityPostSchema);
      const plain = await createUser();
      const res = await request(app, {
        method: 'POST',
        url: `/api/community/posts/${post.id}/comments`,
        headers: auth(plain),
        payload: { body: 'hi' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('nickname_required');
    });
  });

  describe('moderation', () => {
    it('canModerate is true for super admin or support only', () => {
      expect(canModerate({})).toBe(false);
      expect(canModerate({ is_super_admin: false, is_support: false })).toBe(false);
      expect(canModerate({ is_super_admin: true })).toBe(true);
      expect(canModerate({ is_support: true })).toBe(true);
    });

    it('a non-moderator gets 403 from the moderation routes', async () => {
      const user = await createUser();
      const list = await request(app, { method: 'GET', url: '/api/community/moderation/reports', headers: auth(user) });
      expect(list.statusCode).toBe(403);
      const resolve = await request(app, {
        method: 'POST',
        url: `/api/community/moderation/reports/${uuidv7()}/resolve`,
        headers: auth(user),
        payload: { action: 'hide' },
      });
      expect(resolve.statusCode).toBe(403);
      const anon = await request(app, { method: 'GET', url: '/api/community/moderation/reports' });
      expect(anon.statusCode).toBe(401);
    });

    async function report(reporter: TestUser, targetType: 'post' | 'comment', targetId: string): Promise<void> {
      const res = await request(app, {
        method: 'POST',
        url: '/api/community/reports',
        headers: auth(reporter),
        payload: { target_type: targetType, target_id: targetId, reason: 'personal_information' },
      });
      expect(res.statusCode).toBe(201);
    }

    async function openReportFor(moderator: TestUser, targetId: string): Promise<string> {
      const list = await request(app, { method: 'GET', url: '/api/community/moderation/reports?status=open', headers: auth(moderator) });
      expect(list.statusCode).toBe(200);
      const found = (list.json() as { reports: { id: string; target_id: string }[] }).reports.find((r) => r.target_id === targetId);
      if (!found) throw new Error('report not listed');
      expect(list.body).not.toContain('reporter_user_id');
      return found.id;
    }

    it('resolving a report with hide hides the post from the feed', async () => {
      const { user: author } = await nicknamedUser();
      const reporter = await createUser();
      const moderator = await createUser();
      await makeSupport(moderator);
      const post = expectShape(await makePost(author), CommunityPostSchema);
      await report(reporter, 'post', post.id);

      const reportId = await openReportFor(moderator, post.id);
      const res = await request(app, {
        method: 'POST',
        url: `/api/community/moderation/reports/${reportId}/resolve`,
        headers: auth(moderator),
        payload: { action: 'hide' },
      });
      expect(res.statusCode).toBe(200);

      const [row] = await db.select().from(community_posts).where(eq(community_posts.id, post.id));
      expect(row?.status).toBe('hidden');
      const feed = expectShape(await request(app, { method: 'GET', url: '/api/community/feed?limit=50' }), FeedResponseSchema);
      expect(feed.posts.map((p) => p.id)).not.toContain(post.id);
      const publicGet = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}` });
      expect(publicGet.statusCode).toBe(404);
      const modGet = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}`, headers: auth(moderator) });
      expect(modGet.statusCode).toBe(200);

      const again = await request(app, {
        method: 'POST',
        url: `/api/community/moderation/reports/${reportId}/resolve`,
        headers: auth(moderator),
        payload: { action: 'remove' },
      });
      expect(again.statusCode).toBe(409);
    });

    it('resolving with remove removes a comment; dismiss leaves the target alone', async () => {
      const { user: author } = await nicknamedUser();
      const { user: commenter } = await nicknamedUser();
      const reporter = await createUser();
      const moderator = await createUser();
      await makeSupport(moderator);
      const post = expectShape(await makePost(author), CommunityPostSchema);
      const comment = expectShape(
        await request(app, {
          method: 'POST',
          url: `/api/community/posts/${post.id}/comments`,
          headers: auth(commenter),
          payload: { body: 'rude words' },
        }),
        CommunityCommentSchema,
      );

      await report(reporter, 'comment', comment.id);
      await report(reporter, 'post', post.id);

      const commentReport = await openReportFor(moderator, comment.id);
      const removeRes = await request(app, {
        method: 'POST',
        url: `/api/community/moderation/reports/${commentReport}/resolve`,
        headers: auth(moderator),
        payload: { action: 'remove' },
      });
      expect(removeRes.statusCode).toBe(200);
      const [c] = await db.select().from(community_comments).where(eq(community_comments.id, comment.id));
      expect(c?.status).toBe('removed');

      const postReport = await openReportFor(moderator, post.id);
      const dismissRes = await request(app, {
        method: 'POST',
        url: `/api/community/moderation/reports/${postReport}/resolve`,
        headers: auth(moderator),
        payload: { action: 'dismiss' },
      });
      expect(dismissRes.statusCode).toBe(200);
      const [p] = await db.select().from(community_posts).where(eq(community_posts.id, post.id));
      expect(p?.status).toBe('published');
    });

    it('a moderator can remove someone else\'s post directly', async () => {
      const { user: author } = await nicknamedUser();
      const moderator = await createUser();
      await makeSupport(moderator);
      const post = expectShape(await makePost(author), CommunityPostSchema);
      const res = await request(app, { method: 'DELETE', url: `/api/community/posts/${post.id}`, headers: auth(moderator) });
      expect(res.statusCode).toBe(200);
      const [row] = await db.select().from(community_posts).where(eq(community_posts.id, post.id));
      expect(row?.status).toBe('removed');
    });
  });
});
