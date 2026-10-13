import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../src/db/client.js';
import { clusters } from '../src/db/schema/clusters.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { buildTestApp, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser } from './fixtures.js';

describe('sync push and org-only profile fields', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function mkCluster(accountId: string, archived: number | null = null) {
    const id = uuidv7();
    await db.insert(clusters).values({ id, account_id: accountId, name: id, archived_at: archived, created_at: Date.now() });
    return id;
  }

  async function setup() {
    const admin = await createUser();
    const accountId = await createAccount(admin.id, 'agency');
    await addMember(accountId, admin.id, 'admin');
    const staff = await createUser();
    await addMember(accountId, staff.id, 'member');
    const profileId = await createProfile(accountId, admin.id);
    await db.insert(profile_members).values({ profile_id: profileId, user_id: staff.id, relationship_label: null });
    return { admin, staff, accountId, profileId };
  }

  async function foreignCluster() {
    const other = await createUser();
    return mkCluster(await createAccount(other.id, 'agency'));
  }

  async function push(token: string, profileId: string, patch: Record<string, unknown>) {
    const [row0] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const at = Date.now() + 10_000;
    const row = { ...row0, ...patch, client_updated_at: at, version: 0 };
    return request(app, {
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${token}` },
      payload: { profile_id: profileId, mutations: [{ table: 'profiles', id: profileId, op: 'upsert', row, client_updated_at: at }] },
    });
  }
  const stored = async (id: string) => (await db.select().from(profiles).where(eq(profiles.id, id)))[0]!;

  it('ignores cluster_id and archived_at pushed by a member', async () => {
    const s = await setup();
    const mine = await mkCluster(s.accountId);
    const foreign = await foreignCluster();
    for (const cluster_id of [mine, foreign]) {
      const res = await push(s.staff.token, s.profileId, { cluster_id, archived_at: Date.now() });
      expect(res.statusCode).toBe(200);
      const row = await stored(s.profileId);
      expect(row.cluster_id).toBeNull();
      expect(row.archived_at).toBeNull();
    }
  });

  it('keeps the stored cluster when a member pushes a different one', async () => {
    const s = await setup();
    const a = await mkCluster(s.accountId);
    const b = await mkCluster(s.accountId);
    await db.update(profiles).set({ cluster_id: a }).where(eq(profiles.id, s.profileId));
    await push(s.staff.token, s.profileId, { cluster_id: b });
    expect((await stored(s.profileId)).cluster_id).toBe(a);
  });

  it('lets an admin push a cluster of the same account, not a foreign or archived one', async () => {
    const s = await setup();
    const mine = await mkCluster(s.accountId);
    const archived = await mkCluster(s.accountId, Date.now());
    await push(s.admin.token, s.profileId, { cluster_id: await foreignCluster() });
    expect((await stored(s.profileId)).cluster_id).toBeNull();
    await push(s.admin.token, s.profileId, { cluster_id: archived });
    expect((await stored(s.profileId)).cluster_id).toBeNull();
    await push(s.admin.token, s.profileId, { cluster_id: mine });
    expect((await stored(s.profileId)).cluster_id).toBe(mine);
  });
});
