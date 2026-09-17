import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import type { MeResponse, TokensResponse } from '@chipperly/shared/schemas/auth';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, accounts } from '../src/db/schema/accounts.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { verifyPin } from '../src/lib/password.js';

async function registerAndSignIn(app: FastifyInstance, email: string): Promise<{ userId: string; token: string }> {
  const response = await request(app, {
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct-horse', display_name: 'Sam' },
  });
  const tokens = response.json() as TokensResponse;
  const me = await request(app, {
    method: 'GET',
    url: '/api/me',
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const userId = (me.json() as MeResponse).user.id;
  return { userId, token: tokens.access_token };
}

async function insertProfile(accountId: string): Promise<string> {
  const profileId = uuidv7();
  await db.insert(profiles).values({
    id: profileId,
    account_id: accountId,
    name: 'Benny',
    avatar_emoji: '🦁',
    client_updated_at: Date.now(),
    updated_by: profileId,
  });
  return profileId;
}

describe('me routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the signed-in user, their accounts and every profile they can see', async () => {
    const { userId, token } = await registerAndSignIn(app, 'me@example.com');

    const adminAccountId = uuidv7();
    await db.insert(accounts).values({ id: adminAccountId, kind: 'household', name: 'Admin Household', created_at: Date.now() });
    await db.insert(account_members).values({ account_id: adminAccountId, user_id: userId, role: 'admin' });
    const adminProfileId = await insertProfile(adminAccountId);

    const memberAccountId = uuidv7();
    await db.insert(accounts).values({ id: memberAccountId, kind: 'agency', name: 'Care Agency', created_at: Date.now() });
    await db.insert(account_members).values({ account_id: memberAccountId, user_id: userId, role: 'member' });
    const memberProfileId = await insertProfile(memberAccountId);
    const unlistedProfileId = await insertProfile(memberAccountId);
    await db.insert(profile_members).values({ profile_id: memberProfileId, user_id: userId });

    const response = await request(app, {
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as MeResponse;

    expect(body.user.id).toBe(userId);
    expect(body.user.email).toBe('me@example.com');
    expect(body.user.pin_hash).toBeNull();

    const roles = new Map(body.accounts.map((a) => [a.account.id, a.role]));
    expect(roles.get(adminAccountId)).toBe('admin');
    expect(roles.get(memberAccountId)).toBe('member');

    const profileIds = body.profiles.map((p) => p.id);
    expect(profileIds).toContain(adminProfileId);
    expect(profileIds).toContain(memberProfileId);
    expect(profileIds).not.toContain(unlistedProfileId);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app, { method: 'GET', url: '/api/me' });
    expect(response.statusCode).toBe(401);
  });

  it('sets a pin that verifyPin accepts, and round-trips through /me', async () => {
    const { token } = await registerAndSignIn(app, 'pin@example.com');

    const patch = await request(app, {
      method: 'PATCH',
      url: '/api/me/pin',
      headers: { authorization: `Bearer ${token}` },
      payload: { pin: '4242' },
    });
    expect(patch.statusCode).toBe(200);
    const { pin_hash } = patch.json() as { pin_hash: string };
    expect(await verifyPin('4242', pin_hash)).toBe(true);
    expect(await verifyPin('0000', pin_hash)).toBe(false);

    const me = await request(app, {
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect((me.json() as MeResponse).user.pin_hash).toBe(pin_hash);
  });

  it('rejects a pin that is not 4 to 6 digits', async () => {
    const { token } = await registerAndSignIn(app, 'badpin@example.com');
    const response = await request(app, {
      method: 'PATCH',
      url: '/api/me/pin',
      headers: { authorization: `Bearer ${token}` },
      payload: { pin: '12' },
    });
    expect(response.statusCode).toBe(400);
  });
});
