import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import {
  community_comments,
  community_posts,
  community_purchases,
  community_sellers,
} from '../src/db/schema/community.js';
import { env } from '../src/env.js';
import { canModerate } from '../src/lib/moderation.js';
import { platformFeeAmount, platformFeePercent } from '../src/lib/stripeConnect.js';

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

  describe('comment paging', () => {
    it('pages comments oldest first with a cursor and never repeats one', async () => {
      const { user: author } = await nicknamedUser();
      const { user: commenter } = await nicknamedUser();
      const post = expectShape(await makePost(author), CommunityPostSchema);
      const ids: string[] = [];
      for (const text of ['one', 'two', 'three']) {
        const res = await request(app, {
          method: 'POST',
          url: `/api/community/posts/${post.id}/comments`,
          headers: auth(commenter),
          payload: { body: text },
        });
        ids.push(expectShape(res, CommunityCommentSchema).id);
      }
      const get = async (query: string) =>
        (await request(app, { method: 'GET', url: `/api/community/posts/${post.id}/comments${query}` })).json() as {
          comments: { id: string }[];
          next_cursor: string | null;
        };

      const first = await get('?limit=2');
      expect(first.comments.map((c) => c.id)).toEqual(ids.slice(0, 2));
      expect(first.next_cursor).not.toBeNull();
      const second = await get(`?limit=2&cursor=${first.next_cursor}`);
      expect(second.comments.map((c) => c.id)).toEqual(ids.slice(2));
      expect(second.next_cursor).toBeNull();

      const bad = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}/comments?cursor=nonsense` });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('moderation', () => {
    it('tells a moderator to show Delete on someone else\'s post, and a normal user not to', async () => {
      const { user: author } = await nicknamedUser();
      const { user: stranger } = await nicknamedUser();
      const moderator = await createUser();
      await makeSupport(moderator);
      const post = expectShape(await makePost(author), CommunityPostSchema);

      const viewerOf = async (headers: Record<string, string>) => {
        const res = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}`, headers });
        expect(res.statusCode).toBe(200);
        return expectShape(res, CommunityPostSchema).viewer;
      };
      expect(await viewerOf(auth(moderator))).toEqual({ is_mine: false, can_moderate: true });
      expect(await viewerOf(auth(stranger))).toEqual({ is_mine: false, can_moderate: false });
      expect(await viewerOf(auth(author))).toEqual({ is_mine: true, can_moderate: false });
      expect(await viewerOf({})).toEqual({ is_mine: false, can_moderate: false });

      // The same flags come back on the feed, and nothing about the author's identity rides along.
      const feed = await request(app, { method: 'GET', url: '/api/community/feed?limit=50', headers: auth(moderator) });
      const inFeed = expectShape(feed, FeedResponseSchema).posts.find((p) => p.id === post.id);
      expect(inFeed?.viewer).toEqual({ is_mine: false, can_moderate: true });
      expect(feed.body).not.toContain(author.id);
      expect(feed.headers['cache-control']).toContain('no-store');
    });

    it('flags comments the same way', async () => {
      const { user: author } = await nicknamedUser();
      const { user: commenter } = await nicknamedUser();
      const moderator = await createUser();
      await makeSupport(moderator);
      const post = expectShape(await makePost(author), CommunityPostSchema);
      await request(app, {
        method: 'POST',
        url: `/api/community/posts/${post.id}/comments`,
        headers: auth(commenter),
        payload: { body: 'hello' },
      });
      const flagsFor = async (headers: Record<string, string>) => {
        const res = await request(app, { method: 'GET', url: `/api/community/posts/${post.id}/comments`, headers });
        return (res.json() as { comments: { viewer: unknown }[] }).comments[0]?.viewer;
      };
      expect(await flagsFor(auth(moderator))).toEqual({ is_mine: false, can_moderate: true });
      expect(await flagsFor(auth(commenter))).toEqual({ is_mine: true, can_moderate: false });
      expect(await flagsFor(auth(author))).toEqual({ is_mine: false, can_moderate: false });
    });

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

describe('community selling (Stripe Connect)', () => {
  let app: FastifyInstance;
  const WEBHOOK_SECRET = 'whsec_community_test';
  const saved = {
    enabled: env.stripeEnabled,
    key: env.STRIPE_SECRET_KEY,
    hook: env.STRIPE_WEBHOOK_SECRET,
    fee: process.env.COMMUNITY_PLATFORM_FEE_PERCENT,
  };
  // A test-only percent: the real one is the owner's decision and comes from the environment.
  const TEST_FEE_PERCENT = '10';
  const stripeCalls: { url: string; body: string }[] = [];
  const stripeAccount = { charges_enabled: false, payouts_enabled: false, details_submitted: false };

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    env.stripeEnabled = true;
    env.STRIPE_SECRET_KEY = 'sk_test_community';
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.COMMUNITY_PLATFORM_FEE_PERCENT = TEST_FEE_PERCENT;
    stripeCalls.length = 0;
    stripeAccount.charges_enabled = false;
    stripeAccount.payouts_enabled = false;
    stripeAccount.details_submitted = false;
    // Stripe is faked at fetch; app.inject does not use fetch, so requests to the API are unaffected.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: { body?: unknown }) => {
        const url = String(input);
        stripeCalls.push({ url, body: String(init?.body ?? '') });
        if (url.includes('/checkout/sessions')) {
          return new Response(JSON.stringify({ id: `cs_test_${stripeCalls.length}`, url: 'https://checkout.stripe.test/pay' }));
        }
        if (url.includes('/account_links')) return new Response(JSON.stringify({ url: 'https://connect.stripe.test/onboard' }));
        return new Response(JSON.stringify({ id: 'acct_test_1', ...stripeAccount }));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    env.stripeEnabled = saved.enabled;
    env.STRIPE_SECRET_KEY = saved.key;
    env.STRIPE_WEBHOOK_SECRET = saved.hook;
    if (saved.fee === undefined) delete process.env.COMMUNITY_PLATFORM_FEE_PERCENT;
    else process.env.COMMUNITY_PLATFORM_FEE_PERCENT = saved.fee;
  });

  const authHeader = (u: TestUser): Record<string, string> => ({ authorization: `Bearer ${u.token}` });

  async function nicknamed(): Promise<TestUser> {
    const user = await createUser('Sam Seller');
    counter += 1;
    const res = await request(app, {
      method: 'PUT',
      url: '/api/community/me/nickname',
      headers: authHeader(user),
      payload: { nickname: `sell${run}${counter}` },
    });
    expect(res.statusCode).toBe(200);
    return user;
  }

  async function seedSeller(user: TestUser, flags: { charges: boolean; payouts: boolean }): Promise<string> {
    const accountId = `acct_${uuidv7().slice(-12)}`;
    await db.insert(community_sellers).values({
      user_id: user.id,
      stripe_account_id: accountId,
      details_submitted: flags.charges,
      charges_enabled: flags.charges,
      payouts_enabled: flags.payouts,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    return accountId;
  }

  const PAID_STORY = {
    kind: 'story',
    title: 'Dentist visit',
    payload: { title: 'Dentist visit', pages: [{ text: 'Sit in the chair' }] },
    price: { amount: 500, currency: 'usd' },
  };
  const postPaid = (user: TestUser, extra: Record<string, unknown> = {}) =>
    request(app, { method: 'POST', url: '/api/community/posts', headers: authHeader(user), payload: { ...PAID_STORY, ...extra } });

  async function paidPostBy(seller: TestUser): Promise<CommunityPost> {
    await seedSeller(seller, { charges: true, payouts: true });
    const res = await postPaid(seller);
    expect(res.statusCode).toBe(201);
    return expectShape(res, CommunityPostSchema);
  }

  async function markPurchase(postId: string, buyerId: string, sellerId: string, status: 'pending' | 'paid'): Promise<string> {
    const id = uuidv7();
    await db.insert(community_purchases).values({
      id,
      post_id: postId,
      buyer_user_id: buyerId,
      seller_user_id: sellerId,
      status,
      amount: 500,
      currency: 'usd',
      application_fee_amount: 50,
      created_at: Date.now(),
    });
    return id;
  }

  function signed(body: string, secret = WEBHOOK_SECRET): Record<string, string> {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` };
  }
  const webhook = (body: string, headers: Record<string, string>) =>
    request(app, { method: 'POST', url: '/api/community/webhook', headers, payload: body });

  function paidEvent(
    purchaseId: string,
    o: { id?: string; amount?: number; intent?: string; session?: string } = {},
  ): string {
    return JSON.stringify({
      id: o.id ?? `evt_${uuidv7()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          // Unique per event by default: Stripe session ids are unique, and
          // community_purchases.stripe_session_id is unique too, so a shared literal
          // made one case's update collide with a row another case had already paid.
          id: o.session ?? `cs_${uuidv7()}`,
          payment_status: 'paid',
          amount_total: o.amount ?? 500,
          currency: 'usd',
          payment_intent: o.intent ?? 'pi_test_1',
          metadata: { purchase_id: purchaseId },
        },
      },
    });
  }

  describe('who may set a price', () => {
    it('refuses a seller with no Stripe account and says why', async () => {
      const seller = await nicknamed();
      const res = await postPaid(seller);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('seller_not_onboarded');
      expect(res.json().error.message).toContain('Set up payouts');
    });

    it('refuses a seller whose onboarding Stripe has not finished, after asking Stripe once', async () => {
      const seller = await nicknamed();
      await seedSeller(seller, { charges: false, payouts: false });
      const res = await postPaid(seller);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('seller_not_onboarded');
      expect(stripeCalls.some((c) => c.url.includes('/accounts/'))).toBe(true);
      const feed = await request(app, { method: 'GET', url: '/api/community/feed?limit=50' });
      expect(feed.body).not.toContain(PAID_STORY.title);
    });

    it('refuses when charges work but payouts do not', async () => {
      const seller = await nicknamed();
      await seedSeller(seller, { charges: true, payouts: false });
      stripeAccount.charges_enabled = true;
      const res = await postPaid(seller);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toContain('payouts');
    });

    it('refuses to price anything while no platform fee is configured', async () => {
      const seller = await nicknamed();
      await seedSeller(seller, { charges: true, payouts: true });
      delete process.env.COMMUNITY_PLATFORM_FEE_PERCENT;
      const res = await postPaid(seller);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('fee_not_set');
    });

    it('lets a finished seller price a story, and only a story or routine', async () => {
      const seller = await nicknamed();
      await seedSeller(seller, { charges: true, payouts: true });
      const ok = expectShape(await postPaid(seller), CommunityPostSchema);
      expect(ok.price).toEqual({ amount: 500, currency: 'usd' });
      const plain = await postPaid(seller, { kind: 'post', payload: undefined });
      expect(plain.statusCode).toBe(400);
    });

    it('learns the seller finished onboarding from Stripe on the next call', async () => {
      const seller = await nicknamed();
      await seedSeller(seller, { charges: false, payouts: false });
      stripeAccount.charges_enabled = true;
      stripeAccount.payouts_enabled = true;
      stripeAccount.details_submitted = true;
      const res = await postPaid(seller);
      expect(res.statusCode).toBe(201);
    });
  });

  describe('onboarding routes', () => {
    it('creates an Express account once and returns a link; status reports the flags', async () => {
      const seller = await nicknamed();
      const first = await request(app, { method: 'POST', url: '/api/community/selling/onboarding', headers: authHeader(seller) });
      expect(first.statusCode).toBe(200);
      expect(first.json().url).toContain('stripe.test');
      const created = stripeCalls.find((c) => c.url.endsWith('/accounts'));
      expect(created?.body).toContain('type=express');

      await request(app, { method: 'POST', url: '/api/community/selling/onboarding', headers: authHeader(seller) });
      expect(stripeCalls.filter((c) => c.url.endsWith('/accounts'))).toHaveLength(1);

      const status = await request(app, { method: 'GET', url: '/api/community/selling', headers: authHeader(seller) });
      expect(status.json()).toMatchObject({ connected: true, charges_enabled: false, can_sell: false, fee_configured: true });
    });
  });

  describe('buying', () => {
    it('withholds the shared item until it is bought; buyer and author get it', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const stranger = await nicknamed();
      const post = await paidPostBy(seller);
      expect(post.payload).not.toBeNull(); // the author sees their own item
      expect(post.has_access).toBe(true);

      const asStranger = expectShape(
        await request(app, { method: 'GET', url: `/api/community/posts/${post.id}`, headers: authHeader(stranger) }),
        CommunityPostSchema,
      );
      expect(asStranger.has_access).toBe(false);
      expect(asStranger.payload).toBeNull();
      expect(asStranger.price).toEqual({ amount: 500, currency: 'usd' });

      // Assert on THIS post's row, not the whole body: the shared test database also
      // holds free stories from other cases whose text happens to match.
      const publicFeed = await request(app, { method: 'GET', url: '/api/community/feed?limit=50' });
      const mine = (publicFeed.json().posts as { id: string; payload: unknown; has_access: boolean }[]).find((p) => p.id === post.id);
      expect(mine).toBeDefined();
      expect(mine?.payload).toBeNull();
      expect(mine?.has_access).toBe(false);

      await markPurchase(post.id, buyer.id, seller.id, 'pending');
      const pending = expectShape(
        await request(app, { method: 'GET', url: `/api/community/posts/${post.id}`, headers: authHeader(buyer) }),
        CommunityPostSchema,
      );
      expect(pending.payload).toBeNull(); // a started checkout is not a purchase

      await db.update(community_purchases).set({ status: 'paid', paid_at: Date.now() }).where(eq(community_purchases.buyer_user_id, buyer.id));
      const asBuyer = expectShape(
        await request(app, { method: 'GET', url: `/api/community/posts/${post.id}`, headers: authHeader(buyer) }),
        CommunityPostSchema,
      );
      expect(asBuyer.has_access).toBe(true);
      expect(asBuyer.payload).toEqual(PAID_STORY.payload);
    });

    it('starts a destination charge with the platform fee from the environment', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const post = await paidPostBy(seller);
      const [row] = await db.select().from(community_sellers).where(eq(community_sellers.user_id, seller.id));

      const res = await request(app, { method: 'POST', url: `/api/community/posts/${post.id}/checkout`, headers: authHeader(buyer) });
      expect(res.statusCode).toBe(200);
      expect(res.json().url).toContain('checkout.stripe.test');

      const form = new URLSearchParams(stripeCalls.find((c) => c.url.endsWith('/checkout/sessions'))?.body ?? '');
      expect(form.get('mode')).toBe('payment');
      expect(form.get('payment_intent_data[transfer_data][destination]')).toBe(row?.stripe_account_id);
      expect(form.get('payment_intent_data[application_fee_amount]')).toBe(String(platformFeeAmount(500, Number(TEST_FEE_PERCENT))));
      expect(form.get('line_items[0][price_data][unit_amount]')).toBe('500');
      expect(form.get('line_items[0][price_data][currency]')).toBe('usd');
    });

    it('rejects a duplicate purchase, in the API and in the database', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const post = await paidPostBy(seller);
      await markPurchase(post.id, buyer.id, seller.id, 'paid');

      const res = await request(app, { method: 'POST', url: `/api/community/posts/${post.id}/checkout`, headers: authHeader(buyer) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('already_purchased');
      expect(stripeCalls.some((c) => c.url.endsWith('/checkout/sessions'))).toBe(false);

      await expect(markPurchase(post.id, buyer.id, seller.id, 'paid')).rejects.toThrow();
    });

    it('does not let an author buy their own item, or anyone buy a free post', async () => {
      const seller = await nicknamed();
      const post = await paidPostBy(seller);
      const own = await request(app, { method: 'POST', url: `/api/community/posts/${post.id}/checkout`, headers: authHeader(seller) });
      expect(own.statusCode).toBe(409);
      expect(own.json().error.code).toBe('own_post');

      const free = expectShape(
        await request(app, { method: 'POST', url: '/api/community/posts', headers: authHeader(seller), payload: { body: 'free one' } }),
        CommunityPostSchema,
      );
      const buyer = await nicknamed();
      const res = await request(app, { method: 'POST', url: `/api/community/posts/${free.id}/checkout`, headers: authHeader(buyer) });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('webhook', () => {
    it('rejects a missing or wrong signature', async () => {
      const body = paidEvent(uuidv7());
      expect((await webhook(body, { 'content-type': 'application/json' })).statusCode).toBe(400);
      expect((await webhook(body, signed(body, 'whsec_wrong'))).statusCode).toBe(400);
    });

    it('grants a purchase once and ignores a redelivery', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const post = await paidPostBy(seller);
      const purchaseId = await markPurchase(post.id, buyer.id, seller.id, 'pending');
      const body = paidEvent(purchaseId);

      const first = await webhook(body, signed(body));
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ received: true, result: 'applied' });
      const [granted] = await db.select().from(community_purchases).where(eq(community_purchases.id, purchaseId));
      expect(granted?.status).toBe('paid');
      expect(granted?.stripe_payment_intent_id).toBe('pi_test_1');
      const paidAt = granted?.paid_at;

      const again = await webhook(body, signed(body));
      expect(again.json()).toMatchObject({ result: 'duplicate' });
      const [after] = await db.select().from(community_purchases).where(eq(community_purchases.id, purchaseId));
      expect(after?.paid_at).toBe(paidAt);
    });

    it('flags a second payment for an already paid purchase instead of granting twice', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const post = await paidPostBy(seller);
      const purchaseId = await markPurchase(post.id, buyer.id, seller.id, 'pending');
      const first = paidEvent(purchaseId);
      await webhook(first, signed(first));
      const second = paidEvent(purchaseId, { intent: 'pi_test_other' });
      const res = await webhook(second, signed(second));
      expect(res.json()).toMatchObject({ result: 'duplicate_payment' });
    });

    it('does not grant when the paid amount differs from the price', async () => {
      const seller = await nicknamed();
      const buyer = await nicknamed();
      const post = await paidPostBy(seller);
      const purchaseId = await markPurchase(post.id, buyer.id, seller.id, 'pending');
      const body = paidEvent(purchaseId, { amount: 1 });
      expect((await webhook(body, signed(body))).json()).toMatchObject({ result: 'mismatch' });
      const [row] = await db.select().from(community_purchases).where(eq(community_purchases.id, purchaseId));
      expect(row?.status).toBe('pending');
    });

    it('ignores a session that is not one of ours', async () => {
      const body = JSON.stringify({
        id: `evt_${uuidv7()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cs_sub', payment_status: 'paid', metadata: {} } },
      });
      expect((await webhook(body, signed(body))).json()).toMatchObject({ result: 'ignored' });
    });

    it('account.updated refreshes onboarding status, once', async () => {
      const seller = await nicknamed();
      const accountId = await seedSeller(seller, { charges: false, payouts: false });
      const body = JSON.stringify({
        id: `evt_${uuidv7()}`,
        type: 'account.updated',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: accountId, charges_enabled: true, payouts_enabled: true, details_submitted: true } },
      });
      expect((await webhook(body, signed(body))).json()).toMatchObject({ result: 'applied' });
      const [row] = await db.select().from(community_sellers).where(eq(community_sellers.user_id, seller.id));
      expect(row).toMatchObject({ charges_enabled: true, payouts_enabled: true, details_submitted: true });
      expect((await webhook(body, signed(body))).json()).toMatchObject({ result: 'duplicate' });
    });
  });

  describe('with Stripe unset', () => {
    beforeEach(() => {
      env.stripeEnabled = false;
    });

    it('every selling route 404s', async () => {
      const user = await nicknamed();
      const anyId = uuidv7();
      const calls = [
        request(app, { method: 'GET', url: '/api/community/selling', headers: authHeader(user) }),
        request(app, { method: 'POST', url: '/api/community/selling/onboarding', headers: authHeader(user) }),
        request(app, { method: 'POST', url: `/api/community/posts/${anyId}/checkout`, headers: authHeader(user) }),
        webhook('{}', { 'content-type': 'application/json' }),
      ];
      for (const res of await Promise.all(calls)) expect(res.statusCode).toBe(404);
      expect(stripeCalls).toHaveLength(0);
    });

    it('a priced post is refused with a 404 while a free post still works exactly as before', async () => {
      const user = await nicknamed();
      const priced = await postPaid(user);
      expect(priced.statusCode).toBe(404);
      const free = await request(app, {
        method: 'POST',
        url: '/api/community/posts',
        headers: authHeader(user),
        payload: { kind: 'story', title: 'Free story', payload: { title: 'Free story', pages: [] } },
      });
      expect(free.statusCode).toBe(201);
      const post = expectShape(free, CommunityPostSchema);
      expect(post.price).toBeNull();
      expect(post.has_access).toBe(true);
      expect(post.payload).not.toBeNull();
    });

    it('keeps already-priced items out of the feed', async () => {
      const seller = await nicknamed();
      env.stripeEnabled = true;
      const post = await paidPostBy(seller);
      env.stripeEnabled = false;
      const feed = expectShape(await request(app, { method: 'GET', url: '/api/community/feed?limit=50' }), FeedResponseSchema);
      expect(feed.posts.map((p) => p.id)).not.toContain(post.id);
    });
  });

  describe('fee arithmetic', () => {
    it('rounds to whole minor units and never exceeds the price', () => {
      expect(platformFeeAmount(500, 10)).toBe(50);
      expect(platformFeeAmount(499, 10)).toBe(50);
      expect(platformFeeAmount(1, 100)).toBe(1);
      expect(platformFeeAmount(500, 0)).toBe(0);
    });
    it('reads the percent from the environment and treats unset, empty or junk as not configured', () => {
      process.env.COMMUNITY_PLATFORM_FEE_PERCENT = '2.5';
      expect(platformFeePercent()).toBe(2.5);
      for (const bad of ['', '  ', 'abc', '-1', '101']) {
        process.env.COMMUNITY_PLATFORM_FEE_PERCENT = bad;
        expect(platformFeePercent()).toBeNull();
      }
      delete process.env.COMMUNITY_PLATFORM_FEE_PERCENT;
      expect(platformFeePercent()).toBeNull();
    });
  });
});
