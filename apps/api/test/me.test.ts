import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ExportResponseSchema, MeResponseSchema, type MeResponse, type TokensResponse } from '@chipperly/shared/schemas/auth';
import { buildTestApp, expectShape, request } from './helpers.js';
import { addMember, createAccount, createUser, setupProfile } from './fixtures.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, users } from '../src/db/schema/accounts.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { locations } from '../src/db/schema/locations.js';
import { media } from '../src/db/schema/media.js';
import { verifyPin } from '../src/lib/password.js';

async function registerAndSignIn(app: FastifyInstance, email: string): Promise<{ userId: string; token: string }> {
  const response = await request(app, {
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct-horse', display_name: 'Sam', consented_at: Date.now() },
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
    await db.insert(accounts).values({ id: adminAccountId, kind: 'household', name: 'Admin Household', created_at: Date.now(), owner_user_id: userId });
    await db.insert(account_members).values({ account_id: adminAccountId, user_id: userId, role: 'admin' });
    const adminProfileId = await insertProfile(adminAccountId);

    const memberAccountId = uuidv7();
    await db.insert(accounts).values({ id: memberAccountId, kind: 'agency', name: 'Care Agency', created_at: Date.now(), owner_user_id: userId });
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
    const body = expectShape(response, MeResponseSchema);

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

describe('POST /me/lock, POST /me/unlock', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks with no PIN needed, unlocks only with the right one, and gates sync/push in between', async () => {
    const admin = await createUser('Locker');
    const accountId = await createAccount(admin.id, 'household', 'Lock Household');
    await addMember(accountId, admin.id, 'admin');
    const profileId = await insertProfile(accountId);

    await request(app, {
      method: 'PATCH',
      url: '/api/me/pin',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { pin: '4242' },
    });

    const lock = await request(app, {
      method: 'POST',
      url: '/api/me/lock',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { profile_id: profileId },
    });
    expect(lock.statusCode).toBe(200);

    const gatedPush = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        profile_id: profileId,
        mutations: [
          // 'activities' isn't one of lockGateAllows' cases, so it's
          // rejected 'locked' before the row is ever schema-checked --
          // any row shape proves the gate, same as sync.test.ts.
          { table: 'activities', id: uuidv7(), op: 'upsert', row: { name: 'Snack' }, client_updated_at: Date.now() },
        ],
      },
    });
    expect((gatedPush.json() as { rejected: Array<{ reason: string }> }).rejected[0]?.reason).toBe('locked');

    const wrongPin = await request(app, {
      method: 'POST',
      url: '/api/me/unlock',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { pin: '0000' },
    });
    expect(wrongPin.statusCode).toBe(401);

    const rightPin = await request(app, {
      method: 'POST',
      url: '/api/me/unlock',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { pin: '4242' },
    });
    expect(rightPin.statusCode).toBe(200);
    expect(rightPin.json()).toEqual({ locked_profile_id: null });
  });

  it('rejects locking to a profile outside the caller\'s account', async () => {
    const admin = await createUser('Outsider');
    const otherAccountId = await createAccount(admin.id, 'household', 'Someone Else');
    const otherProfileId = await insertProfile(otherAccountId);

    const response = await request(app, {
      method: 'POST',
      url: '/api/me/lock',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { profile_id: otherProfileId },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('DELETE /me', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes a solo account and everything under it, and the user', async () => {
    const user = await createUser('Solo');
    const accountId = await createAccount(user.id, 'individual', 'Solo Household');
    await addMember(accountId, user.id, 'admin');

    const profileRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${accountId}/profiles`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { name: 'Kid' },
    });
    const profile = profileRes.json() as { id: string };

    const response = await request(app, {
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(response.statusCode).toBe(204);

    const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(accountRow).toBeUndefined();
    const [profileRow] = await db.select().from(profiles).where(eq(profiles.id, profile.id));
    expect(profileRow).toBeUndefined();
    const [userRow] = await db.select().from(users).where(eq(users.id, user.id));
    expect(userRow).toBeUndefined();

    const me = await request(app, {
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('just removes the membership when another admin remains, leaving the account intact', async () => {
    const leaving = await createUser('Leaving');
    const staying = await createUser('Staying');
    const accountId = await createAccount(leaving.id, 'household', 'Shared Household');
    await addMember(accountId, leaving.id, 'admin');
    await addMember(accountId, staying.id, 'admin');

    const response = await request(app, {
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${leaving.token}` },
    });
    expect(response.statusCode).toBe(204);

    const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(accountRow).toBeDefined();
    const [membershipRow] = await db
      .select()
      .from(account_members)
      .where(eq(account_members.user_id, leaving.id));
    expect(membershipRow).toBeUndefined();
    const [remainingRow] = await db
      .select()
      .from(account_members)
      .where(eq(account_members.user_id, staying.id));
    expect(remainingRow).toBeDefined();
    const [userRow] = await db.select().from(users).where(eq(users.id, leaving.id));
    expect(userRow).toBeUndefined();
  });

  it('409s with last_admin when the user is the sole admin but other members remain', async () => {
    const admin = await createUser('SoleAdmin');
    const member = await createUser('PlainMember');
    const accountId = await createAccount(admin.id, 'household', 'Needs Another Admin');
    await addMember(accountId, admin.id, 'admin');
    await addMember(accountId, member.id, 'member');

    const response = await request(app, {
      method: 'DELETE',
      url: '/api/me',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('last_admin');

    // Nothing committed: the account, its members and the admin's own user row all survive.
    const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(accountRow).toBeDefined();
    const [userRow] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(userRow).toBeDefined();
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app, { method: 'DELETE', url: '/api/me' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /me/export', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the user, accounts, profiles, synced table rows and media the caller can see', async () => {
    const { admin, accountId, profileId } = await setupProfile();

    const locationId = uuidv7();
    await db.insert(locations).values({
      id: locationId,
      profile_id: profileId,
      client_updated_at: Date.now(),
      updated_by: admin.id,
      name: 'Home',
      position: 0,
    });
    const deletedLocationId = uuidv7();
    await db.insert(locations).values({
      id: deletedLocationId,
      profile_id: profileId,
      client_updated_at: Date.now(),
      updated_by: admin.id,
      name: 'Old place',
      position: 1,
      deleted_at: Date.now(),
    });

    const mediaId = uuidv7();
    await db.insert(media).values({
      id: mediaId,
      account_id: accountId,
      kind: 'image',
      status: 'ready',
      storage_key: `${accountId}/${mediaId}.webp`,
      content_type: 'image/webp',
      bytes: 100,
      original_bytes: 200,
      created_by: admin.id,
      created_at: Date.now(),
    });

    const response = await request(app, {
      method: 'GET',
      url: '/api/me/export',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = expectShape(response, ExportResponseSchema);

    expect(body.user.id).toBe(admin.id);
    expect(body.accounts.map((a) => a.id)).toContain(accountId);
    expect(body.profiles.map((p) => p.id)).toContain(profileId);

    const locationIds = body.tables.locations?.map((row) => row.id) ?? [];
    expect(locationIds).toContain(locationId);
    expect(locationIds).not.toContain(deletedLocationId); // soft-deleted rows aren't "what we have" for the export

    expect(body.media.map((m) => m.id)).toContain(mediaId);
    const mediaRow = body.media.find((m) => m.id === mediaId);
    expect(mediaRow?.url).toBe(`/api/media/${mediaId}`);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app, { method: 'GET', url: '/api/me/export' });
    expect(response.statusCode).toBe(401);
  });
});
