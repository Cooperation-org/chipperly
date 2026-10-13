import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { MUTATION_TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { db, sql } from '../src/db/client.js';
import { profile_members } from '../src/db/schema/profiles.js';
import { buildTestApp, request } from './helpers.js';
import { addMember, createProfile, createUser, setupProfile } from './fixtures.js';
import { getLastMailMessage } from '../src/lib/mailer.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;

describe('viewer role', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  /** An account with one admin, two profiles, and a viewer assigned to the first only. */
  async function setup() {
    const { admin, accountId, profileId } = await setupProfile();
    const otherProfileId = await createProfile(accountId, admin.id, 'Other kid');
    const viewer = await createUser('Viewer');
    await addMember(accountId, viewer.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: profileId, user_id: viewer.id, relationship_label: null });
    return { admin, viewer, accountId, profileId, otherProfileId };
  }

  it('reads the assigned profile and nothing else', async () => {
    const { viewer, accountId, profileId, otherProfileId } = await setup();
    const pull = await request(app, { method: 'GET', url: `/api/sync/pull?profile_id=${profileId}&since=0`, headers: auth(viewer.token) });
    expect(pull.statusCode).toBe(200);
    const other = await request(app, { method: 'GET', url: `/api/sync/pull?profile_id=${otherProfileId}&since=0`, headers: auth(viewer.token) });
    expect(other.statusCode).toBe(403);

    const list = await request(app, { method: 'GET', url: `/api/accounts/${accountId}/profiles`, headers: auth(viewer.token) });
    expect((list.json() as Array<{ id: string }>).map((p) => p.id)).toEqual([profileId]);

    const me = await request(app, { method: 'GET', url: '/api/me', headers: auth(viewer.token) });
    const body = me.json() as { accounts: Array<{ role: string }>; profiles: Array<{ id: string }> };
    expect(body.accounts[0]?.role).toBe('viewer');
    expect(body.profiles.map((p) => p.id)).toEqual([profileId]);
  });

  it('sync push refuses every table as read_only, stores nothing, and keeps the refusals', async () => {
    const { viewer, profileId } = await setup();
    const t = Date.now();
    const mutations = MUTATION_TABLE_NAMES.flatMap((table) => {
      const id = table === 'profiles' ? profileId : uuidv7();
      return [
        { table, id, op: 'upsert' as const, row: { id, profile_id: profileId }, client_updated_at: t },
        { table, id: table === 'profiles' ? profileId : uuidv7(), op: 'delete' as const, client_updated_at: t },
      ];
    });
    const res = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: auth(viewer.token),
      payload: { profile_id: profileId, mutations },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { applied: string[]; rejected: Array<{ id: string; reason: string }> };
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(mutations.length);
    expect(new Set(body.rejected.map((r) => r.reason))).toEqual(new Set(['read_only']));
    const [{ n }] = await sql`select count(*)::int as n from sync_rejections where profile_id = ${profileId} and reason = 'read_only'`;
    expect(n).toBe(new Set(mutations.map((m) => m.id)).size); // one row per write id
  });

  it('sync push to an unassigned profile is a 403', async () => {
    const { viewer, otherProfileId } = await setup();
    const res = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: auth(viewer.token),
      payload: { profile_id: otherProfileId, mutations: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses account and profile writes with 403 read_only', async () => {
    const { viewer, admin, accountId, profileId } = await setup();
    const h = auth(viewer.token);
    const calls = [
      { method: 'POST', url: `/api/accounts/${accountId}/profiles`, payload: { name: 'New' } },
      { method: 'POST', url: `/api/accounts/${accountId}/invites`, payload: { email: 'x@example.com', role: 'member', profile_ids: [] } },
      { method: 'PATCH', url: `/api/accounts/${accountId}/members/${admin.id}`, payload: { role: 'member' } },
      { method: 'DELETE', url: `/api/accounts/${accountId}/members/${admin.id}` },
      { method: 'POST', url: `/api/profiles/${profileId}/first-then`, payload: { progress: null } },
      { method: 'POST', url: `/api/profiles/${profileId}/reward-request`, payload: { reward_name: 'Ice cream', source: 'manual' } },
      { method: 'POST', url: `/api/profiles/${profileId}/location-changed`, payload: { new_location_id: null, old_location_id: null } },
      { method: 'PUT', url: `/api/profiles/${profileId}/review-reminder`, payload: { every_days: 7, hour: 19 } },
      { method: 'POST', url: '/api/me/lock', payload: { profile_id: profileId } },
    ] as const;
    for (const c of calls) {
      const res = await request(app, { method: c.method, url: c.url, headers: h, payload: 'payload' in c ? c.payload : undefined });
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(403);
      expect(codeOf(res), `${c.method} ${c.url}`).toBe('read_only');
    }
  });

  it('refuses uploads with 403 read_only', async () => {
    const { viewer, accountId } = await setup();
    const res = await request(app, { method: 'POST', url: '/api/media', headers: { ...auth(viewer.token), 'x-account-id': accountId } });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('read_only');
  });

  it('a viewer cannot reassign a device to a profile or lock/rest a child phone', async () => {
    const { viewer, profileId } = await setup();
    const deviceId = uuidv7();
    await request(app, { method: 'PUT', url: `/api/me/devices/${deviceId}`, headers: auth(viewer.token), payload: { platform: 'web' } });
    const patch = await request(app, { method: 'PATCH', url: `/api/me/devices/${deviceId}`, headers: auth(viewer.token), payload: { profile_id: profileId } });
    expect(patch.statusCode).toBe(403);
    expect(codeOf(patch)).toBe('read_only');
  });

  it('a member is still allowed what they were before', async () => {
    const { admin, accountId, profileId } = await setup();
    const member = await createUser('Member');
    await addMember(accountId, member.id, 'member');
    await db.insert(profile_members).values({ profile_id: profileId, user_id: member.id, relationship_label: null });
    const t = Date.now();
    const id = uuidv7();
    const res = await request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: auth(member.token),
      payload: {
        profile_id: profileId,
        mutations: [{ table: 'chip_ledger', id, op: 'upsert', client_updated_at: t, row: { id, profile_id: profileId, version: 0, client_updated_at: t, updated_by: admin.id, deleted_at: null, location_id: null, delta: 1, reason: 'manual', ref_id: null, created_at: t, created_by: member.id } }],
      },
    });
    expect((res.json() as { applied: string[] }).applied).toEqual([id]);
  });

  describe('invites', () => {
    async function makeHousehold() {
      const admin = await createUser('hh-admin');
      const created = await request(app, { method: 'POST', url: '/api/accounts', headers: auth(admin.token), payload: { kind: 'household', name: 'HH' } });
      return { admin, accountId: (created.json() as { account: { id: string } }).account.id };
    }

    it('invites a viewer with a profile list, and accepting gives read access only', async () => {
      const { admin, accountId } = await makeHousehold();
      const profileId = await createProfile(accountId, admin.id);
      const inv = await request(app, {
        method: 'POST',
        url: `/api/accounts/${accountId}/invites`,
        headers: auth(admin.token),
        payload: { email: 'grandma@example.com', role: 'viewer', profile_ids: [profileId] },
      });
      expect(inv.statusCode).toBe(201);
      expect((inv.json() as { role: string }).role).toBe('viewer');
      const token = getLastMailMessage()?.text.match(/token=([^\s&]+)/)?.[1];
      expect(token).toBeTruthy();

      const details = await request(app, { method: 'GET', url: `/api/invites/${token}` });
      expect((details.json() as { role: string }).role).toBe('viewer');

      const grandma = await createUser('grandma');
      const accept = await request(app, { method: 'POST', url: `/api/invites/${token}/accept`, headers: auth(grandma.token) });
      expect(accept.statusCode).toBe(200);

      expect((await request(app, { method: 'GET', url: `/api/sync/pull?profile_id=${profileId}&since=0`, headers: auth(grandma.token) })).statusCode).toBe(200);
      const t = Date.now();
      const push = await request(app, {
        method: 'POST',
        url: '/api/sync/push',
        headers: auth(grandma.token),
        payload: { profile_id: profileId, mutations: [{ table: 'rewards', id: uuidv7(), op: 'delete', client_updated_at: t }] },
      });
      expect((push.json() as { rejected: Array<{ reason: string }> }).rejected[0]?.reason).toBe('read_only');
    });

    it('a household with two admins can still add viewers', async () => {
      const { admin, accountId } = await makeHousehold();
      const second = await createUser('second-admin');
      await addMember(accountId, second.id, 'admin');
      const third = await request(app, {
        method: 'POST',
        url: `/api/accounts/${accountId}/invites`,
        headers: auth(admin.token),
        payload: { email: 'third@example.com', role: 'admin', profile_ids: [] },
      });
      expect(third.statusCode).toBe(409);

      const inv = await request(app, {
        method: 'POST',
        url: `/api/accounts/${accountId}/invites`,
        headers: auth(admin.token),
        payload: { email: 'sitter@example.com', role: 'viewer', profile_ids: [] },
      });
      expect(inv.statusCode).toBe(201);
      const token = getLastMailMessage()?.text.match(/token=([^\s&]+)/)?.[1];
      const sitter = await createUser('sitter');
      expect((await request(app, { method: 'POST', url: `/api/invites/${token}/accept`, headers: auth(sitter.token) })).statusCode).toBe(200);

      // Promoting a member to viewer and demoting an admin to viewer both leave the admin count alone.
      const patch = await request(app, { method: 'PATCH', url: `/api/accounts/${accountId}/members/${second.id}`, headers: auth(admin.token), payload: { role: 'viewer' } });
      expect(patch.statusCode).toBe(200);
    });
  });
});

