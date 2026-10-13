import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { account_members, invites, users } from '../src/db/schema/accounts.js';
import { profile_members } from '../src/db/schema/profiles.js';
import { buildTestApp, request } from './helpers.js';
import { addMember, createUser, setupProfile } from './fixtures.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;
const uniqueEmail = (label: string) => `${label}-${Math.random().toString(36).slice(2)}@example.com`;

describe('own login for a supported person', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const post = (token: string, accountId: string, profileId: string, payload: unknown) =>
    request(app, { method: 'POST', url: `/api/accounts/${accountId}/profiles/${profileId}/login`, headers: auth(token), payload });

  it('invite mode sends a member invite limited to that profile with relationship self', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    const email = uniqueEmail('invite');
    const res = await post(admin.token, accountId, profileId, { mode: 'invite', email });
    expect(res.statusCode).toBe(201);
    const [invite] = await db.select().from(invites).where(eq(invites.email, email));
    expect(invite).toMatchObject({ role: 'member', profile_ids: [profileId], relationship_label: 'self', account_id: accountId });
  });

  it('password mode creates a member who must change the password before anything else', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    const email = uniqueEmail('pw');
    const res = await post(admin.token, accountId, profileId, { mode: 'password', email, password: 'temporary-pass-1' });
    expect(res.statusCode).toBe(201);
    const [created] = await db.select().from(users).where(eq(users.email, email));
    expect(created?.must_change_password).toBe(true);
    const [member] = await db.select().from(account_members).where(eq(account_members.user_id, created!.id));
    expect(member?.role).toBe('member');
    const [link] = await db.select().from(profile_members).where(eq(profile_members.user_id, created!.id));
    expect(link).toMatchObject({ profile_id: profileId, relationship_label: 'self' });

    const login = await request(app, { method: 'POST', url: '/api/auth/login', payload: { email, password: 'temporary-pass-1' } });
    expect(login.statusCode).toBe(200);
    const tokens = login.json() as { access_token: string; must_change_password?: boolean };
    expect(tokens.must_change_password).toBe(true);

    for (const url of ['/api/me', `/api/accounts/${accountId}/profiles`]) {
      const blocked = await request(app, { method: 'GET', url, headers: auth(tokens.access_token) });
      expect(blocked.statusCode).toBe(403);
      expect(codeOf(blocked)).toBe('must_change_password');
    }

    const short = await request(app, { method: 'POST', url: '/api/me/change-password', headers: auth(tokens.access_token), payload: { password: 'short' } });
    expect(short.statusCode).toBe(400);
    const changed = await request(app, { method: 'POST', url: '/api/me/change-password', headers: auth(tokens.access_token), payload: { password: 'my-own-password-2' } });
    expect(changed.statusCode).toBe(200);

    const me = await request(app, { method: 'GET', url: '/api/me', headers: auth(tokens.access_token) });
    expect(me.statusCode).toBe(200);
    const again = await request(app, { method: 'POST', url: '/api/auth/login', payload: { email, password: 'my-own-password-2' } });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { must_change_password?: boolean }).must_change_password).toBeUndefined();
    const old = await request(app, { method: 'POST', url: '/api/auth/login', payload: { email, password: 'temporary-pass-1' } });
    expect(old.statusCode).toBe(401);
  });

  it('refuses an email that already has a login, in both modes', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    const [taken] = await db.select().from(users).where(eq(users.id, admin.id));
    for (const mode of ['invite', 'password'] as const) {
      const res = await post(admin.token, accountId, profileId, { mode, email: taken!.email, password: 'temporary-pass-1' });
      expect(res.statusCode).toBe(409);
      expect(codeOf(res)).toBe('email_taken');
    }
  });

  it('refuses a short temporary password and a missing one', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    const short = await post(admin.token, accountId, profileId, { mode: 'password', email: uniqueEmail('s'), password: 'short' });
    expect(short.statusCode).toBe(400);
    const none = await post(admin.token, accountId, profileId, { mode: 'password', email: uniqueEmail('n') });
    expect(none.statusCode).toBe(400);
  });

  it('is admin only: a member, a viewer and an outsider are refused', async () => {
    const { admin, accountId, profileId } = await setupProfile();
    const member = await createUser('Member');
    await addMember(accountId, member.id, 'member');
    const viewer = await createUser('Viewer');
    await addMember(accountId, viewer.id, 'viewer');
    const outsider = await createUser('Outsider');
    const payload = { mode: 'password', email: uniqueEmail('x'), password: 'temporary-pass-1' };
    expect((await post(member.token, accountId, profileId, payload)).statusCode).toBe(403);
    expect((await post(viewer.token, accountId, profileId, payload)).statusCode).toBe(403);
    expect((await post(outsider.token, accountId, profileId, payload)).statusCode).toBe(403);
    expect((await post(admin.token, accountId, profileId, payload)).statusCode).toBe(201);
  });

  it('refuses a profile from another account', async () => {
    const a = await setupProfile();
    const b = await setupProfile();
    const res = await post(a.admin.token, a.accountId, b.profileId, { mode: 'invite', email: uniqueEmail('o') });
    expect(res.statusCode).toBe(404);
  });
});
