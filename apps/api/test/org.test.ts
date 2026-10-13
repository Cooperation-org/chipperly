import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { invites } from '../src/db/schema/accounts.js';
import { clusters } from '../src/db/schema/clusters.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { locations } from '../src/db/schema/locations.js';
import { env } from '../src/env.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { notifyIfOverSeats, seatLimitFor } from '../src/lib/orgSeats.js';
import { BulkProfilesResponseSchema, ClustersResponseSchema, RosterResponseSchema } from '@chipperly/shared/schemas/org';
import { buildTestApp, expectShape, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser } from './fixtures.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;

describe('organization routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  /** An agency account with an admin, plus a staff member and a family viewer who can each see one person. */
  async function setup() {
    const admin = await createUser('Olga Owner');
    const accountId = await createAccount(admin.id, 'agency', 'Bright Steps');
    await addMember(accountId, admin.id, 'admin');
    const ava = await createProfile(accountId, admin.id, 'Ava');
    const ben = await createProfile(accountId, admin.id, 'Ben');
    const staff = await createUser('Sam Staff');
    await addMember(accountId, staff.id, 'member');
    await db.insert(profile_members).values({ profile_id: ava, user_id: staff.id, relationship_label: null });
    const parent = await createUser('Pat Parent');
    await addMember(accountId, parent.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: ava, user_id: parent.id, relationship_label: null });
    const otherParent = await createUser('Other Parent');
    await addMember(accountId, otherParent.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: ava, user_id: otherParent.id, relationship_label: null });
    return { admin, staff, parent, otherParent, accountId, ava, ben };
  }

  const get = (token: string, url: string) => request(app, { method: 'GET', url, headers: auth(token) });
  const send = (method: 'POST' | 'PATCH', token: string, url: string, payload: unknown) =>
    request(app, { method, url, headers: auth(token), payload: payload as object });

  describe('org-only and permission rules', () => {
    it('refuses every org route on a household with 409 not_an_org', async () => {
      const admin = await createUser();
      const accountId = await createAccount(admin.id, 'household');
      await addMember(accountId, admin.id, 'admin');
      const pid = await createProfile(accountId, admin.id);
      const cid = '00000000-0000-7000-8000-000000000000';
      const calls = [
        send('PATCH', admin.token, `/api/accounts/${accountId}/org`, { name: 'X' }),
        get(admin.token, `/api/accounts/${accountId}/clusters`),
        send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'X' }),
        send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${cid}`, { name: 'Y' }),
        get(admin.token, `/api/accounts/${accountId}/roster`),
        send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, { people: [{ name: 'A' }] }),
        send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${pid}`, { archived: true }),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.statusCode).toBe(409);
        expect(codeOf(res)).toBe('not_an_org');
      }
    });

    it('refuses a stranger with 403 on every route', async () => {
      const { accountId, ava } = await setup();
      const stranger = await createUser();
      const cid = ava;
      const calls = [
        send('PATCH', stranger.token, `/api/accounts/${accountId}/org`, { name: 'X' }),
        get(stranger.token, `/api/accounts/${accountId}/clusters`),
        send('POST', stranger.token, `/api/accounts/${accountId}/clusters`, { name: 'X' }),
        send('PATCH', stranger.token, `/api/accounts/${accountId}/clusters/${cid}`, { name: 'Y' }),
        get(stranger.token, `/api/accounts/${accountId}/roster`),
        send('POST', stranger.token, `/api/accounts/${accountId}/profiles/bulk`, { people: [{ name: 'A' }] }),
        send('PATCH', stranger.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true }),
      ];
      for (const res of await Promise.all(calls)) expect(res.statusCode).toBe(403);
    });

    it('lets staff and family read but not change anything (403, read_only for viewers)', async () => {
      const { staff, parent, accountId, ava } = await setup();
      for (const user of [staff, parent]) {
        expect((await send('PATCH', user.token, `/api/accounts/${accountId}/org`, { name: 'X' })).statusCode).toBe(403);
        expect((await send('POST', user.token, `/api/accounts/${accountId}/clusters`, { name: 'X' })).statusCode).toBe(403);
        expect((await send('POST', user.token, `/api/accounts/${accountId}/profiles/bulk`, { people: [{ name: 'A' }] })).statusCode).toBe(403);
        expect((await send('PATCH', user.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true })).statusCode).toBe(403);
        expect((await get(user.token, `/api/accounts/${accountId}/clusters`)).statusCode).toBe(200);
        expect((await get(user.token, `/api/accounts/${accountId}/roster`)).statusCode).toBe(200);
      }
      const viewerTry = await send('POST', parent.token, `/api/accounts/${accountId}/clusters`, { name: 'X' });
      expect(codeOf(viewerTry)).toBe('read_only');
    });

    it('requires sign-in', async () => {
      const { accountId } = await setup();
      const res = await request(app, { method: 'GET', url: `/api/accounts/${accountId}/roster` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /accounts/:id/org', () => {
    it('updates name, type and size, and leaves what it was not given', async () => {
      const { admin, accountId } = await setup();
      const res = await send('PATCH', admin.token, `/api/accounts/${accountId}/org`, { name: 'Bright Steps ABA', org_type: 'aba', org_size_estimate: 80 });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { account: { name: string; org_type: string; org_size_estimate: number; kind: string } };
      expect(body.account).toMatchObject({ name: 'Bright Steps ABA', org_type: 'aba', org_size_estimate: 80, kind: 'agency' });

      const again = await send('PATCH', admin.token, `/api/accounts/${accountId}/org`, { org_size_estimate: null });
      expect((again.json() as { account: { name: string; org_type: string; org_size_estimate: null } }).account).toMatchObject({
        name: 'Bright Steps ABA',
        org_type: 'aba',
        org_size_estimate: null,
      });
    });

    it('rejects a bad type, an empty name and an empty body', async () => {
      const { admin, accountId } = await setup();
      expect((await send('PATCH', admin.token, `/api/accounts/${accountId}/org`, { org_type: 'bank' })).statusCode).toBe(400);
      expect((await send('PATCH', admin.token, `/api/accounts/${accountId}/org`, { name: '  ' })).statusCode).toBe(400);
      expect((await send('PATCH', admin.token, `/api/accounts/${accountId}/org`, {})).statusCode).toBe(400);
    });
  });

  describe('clusters', () => {
    it('creates, lists with counts, renames and archives an empty cluster', async () => {
      const { admin, accountId, ava } = await setup();
      const create = await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: '  North clinic ' });
      expect(create.statusCode).toBe(201);
      const north = create.json() as { id: string; name: string };
      expect(north.name).toBe('North clinic');
      const south = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'South' })).json() as { id: string };

      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: north.id });

      const list = expectShape(await get(admin.token, `/api/accounts/${accountId}/clusters`), ClustersResponseSchema);
      expect(list.clusters.map((c) => [c.name, c.profile_count])).toEqual([
        ['North clinic', 1],
        ['South', 0],
      ]);

      const renamed = await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${south.id}`, { name: 'South site' });
      expect((renamed.json() as { name: string }).name).toBe('South site');

      const archived = await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${south.id}`, { archived: true });
      expect(archived.statusCode).toBe(200);
      expect((archived.json() as { archived_at: number }).archived_at).toBeGreaterThan(0);
      const after = expectShape(await get(admin.token, `/api/accounts/${accountId}/clusters`), ClustersResponseSchema);
      expect(after.clusters.find((c) => c.id === south.id)?.archived_at).not.toBeNull();
    });

    it('refuses a duplicate name in any case, but allows it once the first is archived', async () => {
      const { admin, accountId } = await setup();
      const first = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'Team A' })).json() as { id: string };
      const dup = await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'team a' });
      expect(dup.statusCode).toBe(409);
      expect(codeOf(dup)).toBe('cluster_exists');

      await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${first.id}`, { archived: true });
      const again = await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'team a' });
      expect(again.statusCode).toBe(201);

      // Bringing the archived one back now clashes.
      const restore = await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${first.id}`, { archived: false });
      expect(restore.statusCode).toBe(409);
      expect(codeOf(restore)).toBe('cluster_exists');
    });

    it('allows the same name in two different organizations', async () => {
      const a = await setup();
      const b = await setup();
      expect((await send('POST', a.admin.token, `/api/accounts/${a.accountId}/clusters`, { name: 'Same' })).statusCode).toBe(201);
      expect((await send('POST', b.admin.token, `/api/accounts/${b.accountId}/clusters`, { name: 'Same' })).statusCode).toBe(201);
    });

    it('refuses to archive a cluster with people in it (409 cluster_not_empty) until they move or are archived', async () => {
      const { admin, accountId, ava } = await setup();
      const c = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'Busy' })).json() as { id: string };
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: c.id });

      const refused = await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${c.id}`, { archived: true });
      expect(refused.statusCode).toBe(409);
      expect(codeOf(refused)).toBe('cluster_not_empty');

      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });
      expect((await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${c.id}`, { archived: true })).statusCode).toBe(200);
    });

    it('404s for a cluster in another organization', async () => {
      const a = await setup();
      const b = await setup();
      const c = (await send('POST', b.admin.token, `/api/accounts/${b.accountId}/clusters`, { name: 'Theirs' })).json() as { id: string };
      expect((await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/clusters/${c.id}`, { name: 'Mine' })).statusCode).toBe(404);
    });

    it('shows staff and family only the clusters their own people are in', async () => {
      const { admin, staff, accountId, ava } = await setup();
      const mine = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'Mine' })).json() as { id: string };
      await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'Not mine' });
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: mine.id });
      const list = expectShape(await get(staff.token, `/api/accounts/${accountId}/clusters`), ClustersResponseSchema);
      expect(list.clusters.map((c) => c.name)).toEqual(['Mine']);
    });
  });

  describe('PATCH /accounts/:id/profiles/:pid', () => {
    it('moves a person into a cluster and out again', async () => {
      const { admin, accountId, ava } = await setup();
      const c = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'C' })).json() as { id: string };
      const moved = await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: c.id });
      expect(moved.statusCode).toBe(200);
      expect((moved.json() as { cluster_id: string }).cluster_id).toBe(c.id);
      const out = await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: null });
      expect((out.json() as { cluster_id: null }).cluster_id).toBeNull();
    });

    it('refuses an archived cluster and a cluster from another org', async () => {
      const a = await setup();
      const b = await setup();
      const theirs = (await send('POST', b.admin.token, `/api/accounts/${b.accountId}/clusters`, { name: 'T' })).json() as { id: string };
      expect((await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/profiles/${a.ava}`, { cluster_id: theirs.id })).statusCode).toBe(404);

      const old = (await send('POST', a.admin.token, `/api/accounts/${a.accountId}/clusters`, { name: 'Old' })).json() as { id: string };
      await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/clusters/${old.id}`, { archived: true });
      const res = await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/profiles/${a.ava}`, { cluster_id: old.id });
      expect(res.statusCode).toBe(409);
      expect(codeOf(res)).toBe('cluster_archived');
    });

    it('archives and restores a person; the row stays in the database', async () => {
      const { admin, accountId, ava } = await setup();
      const res = await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });
      expect((res.json() as { archived_at: number }).archived_at).toBeGreaterThan(0);
      const [row] = await db.select().from(profiles).where(eq(profiles.id, ava));
      expect(row?.archived_at).not.toBeNull();
      expect(row?.deleted_at).toBeNull();

      const back = await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: false });
      expect((back.json() as { archived_at: null }).archived_at).toBeNull();
    });

    it('clears a restored person from a cluster that was archived meanwhile', async () => {
      const { admin, accountId, ava } = await setup();
      const c = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'Gone soon' })).json() as { id: string };
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: c.id });
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });
      await send('PATCH', admin.token, `/api/accounts/${accountId}/clusters/${c.id}`, { archived: true });
      const back = await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: false });
      expect((back.json() as { cluster_id: null }).cluster_id).toBeNull();
    });

    it('404s for a person in another org and 400s on an empty body', async () => {
      const a = await setup();
      const b = await setup();
      expect((await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/profiles/${b.ava}`, { archived: true })).statusCode).toBe(404);
      expect((await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/profiles/${a.ava}`, {})).statusCode).toBe(400);
    });

    it('bumps the sync version so devices pull the change', async () => {
      const { admin, accountId, ava } = await setup();
      const [before] = await db.select({ v: profiles.version }).from(profiles).where(eq(profiles.id, ava));
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });
      const pull = await get(admin.token, `/api/sync/pull?profile_id=${ava}&since=${before!.v}`);
      const rows = (pull.json() as { changes: { profiles: Array<{ archived_at: number | null }> } }).changes.profiles;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.archived_at).toBeGreaterThan(0);
    });
  });

  describe('archived people are hidden from lists but kept', () => {
    it('drops them from /me and /accounts/:id/profiles for admins and members', async () => {
      const { admin, staff, accountId, ava, ben } = await setup();
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });

      const meAdmin = (await get(admin.token, '/api/me')).json() as { profiles: Array<{ id: string }> };
      expect(meAdmin.profiles.map((p) => p.id)).toEqual([ben]);
      const meStaff = (await get(staff.token, '/api/me')).json() as { profiles: Array<{ id: string }> };
      expect(meStaff.profiles).toEqual([]);

      const listAdmin = (await get(admin.token, `/api/accounts/${accountId}/profiles`)).json() as Array<{ id: string }>;
      expect(listAdmin.map((p) => p.id)).toEqual([ben]);
      const listStaff = (await get(staff.token, `/api/accounts/${accountId}/profiles`)).json() as Array<{ id: string }>;
      expect(listStaff).toEqual([]);
    });

    it('keeps them in the data export', async () => {
      const { admin, accountId, ava } = await setup();
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { archived: true });
      const exp = (await get(admin.token, '/api/me/export')).json() as { profiles: Array<{ id: string }> };
      expect(exp.profiles.map((p) => p.id)).toContain(ava);
    });
  });

  describe('GET /accounts/:id/roster', () => {
    it('gives an admin everyone, with the team, and counts seats without archived people', async () => {
      const { admin, accountId, ava, ben } = await setup();
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ben}`, { archived: true });
      const roster = expectShape(await get(admin.token, `/api/accounts/${accountId}/roster`), RosterResponseSchema);
      expect(roster.people.map((p) => p.name)).toEqual(['Ava']);
      expect(roster.seats).toEqual({ used: 1, limit: null });
      expect(roster.people[0]?.team.map((t) => [t.display_name, t.role])).toEqual([
        ['Other Parent', 'viewer'],
        ['Pat Parent', 'viewer'],
        ['Sam Staff', 'member'],
      ]);
      expect(roster.people[0]?.profile_id).toBe(ava);
    });

    it('filters by status, cluster, none and search text (with wildcards treated as text)', async () => {
      const { admin, accountId, ava, ben } = await setup();
      const c = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'C' })).json() as { id: string };
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ava}`, { cluster_id: c.id });
      await send('PATCH', admin.token, `/api/accounts/${accountId}/profiles/${ben}`, { archived: true });
      const names = async (qs: string) =>
        expectShape(await get(admin.token, `/api/accounts/${accountId}/roster${qs}`), RosterResponseSchema).people.map((p) => p.name);

      expect(await names('')).toEqual(['Ava']);
      expect(await names('?status=archived')).toEqual(['Ben']);
      expect(await names('?status=all')).toEqual(['Ava', 'Ben']);
      expect(await names(`?cluster_id=${c.id}`)).toEqual(['Ava']);
      expect(await names('?status=all&cluster_id=none')).toEqual(['Ben']);
      expect(await names('?status=all&q=EN')).toEqual(['Ben']);
      expect(await names('?status=all&q=%25')).toEqual([]);
      expect((await get(admin.token, `/api/accounts/${accountId}/roster?status=nope`)).statusCode).toBe(400);
    });

    it('shows staff only their assigned people, and a family only staff and themselves on the team', async () => {
      const { staff, parent, accountId, ava } = await setup();
      const asStaff = expectShape(await get(staff.token, `/api/accounts/${accountId}/roster`), RosterResponseSchema);
      expect(asStaff.people.map((p) => p.profile_id)).toEqual([ava]);
      expect(asStaff.people[0]?.team.map((t) => t.display_name)).toEqual(['Sam Staff']);

      const asParent = expectShape(await get(parent.token, `/api/accounts/${accountId}/roster`), RosterResponseSchema);
      expect(asParent.people.map((p) => p.profile_id)).toEqual([ava]);
      expect(asParent.people[0]?.team.map((t) => t.display_name)).toEqual(['Pat Parent', 'Sam Staff']);
    });

    it('shows a member with no assignments an empty list', async () => {
      const { accountId } = await setup();
      const loner = await createUser();
      await addMember(accountId, loner.id, 'member');
      const roster = expectShape(await get(loner.token, `/api/accounts/${accountId}/roster`), RosterResponseSchema);
      expect(roster.people).toEqual([]);
    });

    it('does not leak people from another org', async () => {
      const a = await setup();
      const b = await setup();
      const roster = expectShape(await get(a.admin.token, `/api/accounts/${a.accountId}/roster`), RosterResponseSchema);
      expect(roster.people.map((p) => p.profile_id).sort()).toEqual([a.ava, a.ben].sort());
      expect(roster.people.some((p) => p.profile_id === b.ava)).toBe(false);
    });
  });

  describe('POST /accounts/:id/profiles/bulk', () => {
    it('creates people with a starter day, makes clusters by name once, and reuses existing ones', async () => {
      const { admin, accountId } = await setup();
      const existing = (await send('POST', admin.token, `/api/accounts/${accountId}/clusters`, { name: 'North' })).json() as { id: string };
      const res = await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, {
        people: [
          { name: 'Cal', cluster_name: 'south' },
          { name: 'Dee', cluster_name: 'South' },
          { name: 'Eli', cluster_name: 'NORTH' },
          { name: 'Fay', cluster_id: existing.id },
          { name: 'Gus' },
        ],
      });
      expect(res.statusCode).toBe(201);
      const body = expectShape(res, BulkProfilesResponseSchema);
      expect(body.created.map((c) => c.name)).toEqual(['Cal', 'Dee', 'Eli', 'Fay', 'Gus']);
      expect(body.errors).toEqual([]);
      expect(body.invites_sent).toBe(0);
      expect(body.seats).toEqual({ used: 7, limit: null, over: false });

      const all = await db.select().from(clusters).where(eq(clusters.account_id, accountId));
      expect(all.map((c) => c.name).sort()).toEqual(['North', 'south']);
      const rows = await db.select().from(profiles).where(eq(profiles.account_id, accountId));
      const byName = new Map(rows.map((r) => [r.name, r]));
      const south = all.find((c) => c.name === 'south')!.id;
      expect(byName.get('Cal')?.cluster_id).toBe(south);
      expect(byName.get('Dee')?.cluster_id).toBe(south);
      expect(byName.get('Eli')?.cluster_id).toBe(existing.id);
      expect(byName.get('Fay')?.cluster_id).toBe(existing.id);
      expect(byName.get('Gus')?.cluster_id).toBeNull();

      const homes = await db.select().from(locations).where(eq(locations.profile_id, byName.get('Cal')!.id));
      expect(homes.length).toBeGreaterThan(0);
    });

    it('sends one viewer invite per parent email, covering all of their children', async () => {
      const { admin, accountId } = await setup();
      const res = await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, {
        people: [
          { name: 'Hal', parent_email: 'Mum@Example.com' },
          { name: 'Ivy', parent_email: 'mum@example.com' },
          { name: 'Jon', parent_email: 'dad@example.com' },
          { name: 'Kit' },
        ],
      });
      const body = expectShape(res, BulkProfilesResponseSchema);
      expect(body.invites_sent).toBe(2);
      const rows = await db.select().from(invites).where(eq(invites.account_id, accountId));
      expect(rows.map((r) => [r.email, r.role, r.profile_ids.length]).sort()).toEqual([
        ['dad@example.com', 'viewer', 1],
        ['mum@example.com', 'viewer', 2],
      ]);
      expect(rows.every((r) => r.invited_by === admin.id && r.accepted_at === null)).toBe(true);
      expect(getLastMailMessage()?.to).toMatch(/@example\.com$/);

      const ids = new Map(body.created.map((c) => [c.name, c.profile_id]));
      const mum = rows.find((r) => r.email === 'mum@example.com')!;
      expect([...mum.profile_ids].sort()).toEqual([ids.get('Hal')!, ids.get('Ivy')!].sort());
    });

    it('reports bad rows by position and still creates the good ones', async () => {
      const { admin, accountId } = await setup();
      const fake = '00000000-0000-7000-8000-000000000000';
      const res = await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, {
        people: [{ name: 'Good' }, { name: '' }, { name: 'Bad mail', parent_email: 'nope' }, { name: 'Bad cluster', cluster_id: fake }, 'text', { name: 'Also good' }],
      });
      const body = expectShape(res, BulkProfilesResponseSchema);
      expect(body.created.map((c) => c.name)).toEqual(['Good', 'Also good']);
      expect(body.errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
      expect(body.invites_sent).toBe(0);
    });

    it('refuses a cluster_id from an archived cluster or another org', async () => {
      const a = await setup();
      const b = await setup();
      const theirs = (await send('POST', b.admin.token, `/api/accounts/${b.accountId}/clusters`, { name: 'T' })).json() as { id: string };
      const old = (await send('POST', a.admin.token, `/api/accounts/${a.accountId}/clusters`, { name: 'Old' })).json() as { id: string };
      await send('PATCH', a.admin.token, `/api/accounts/${a.accountId}/clusters/${old.id}`, { archived: true });
      const body = expectShape(
        await send('POST', a.admin.token, `/api/accounts/${a.accountId}/profiles/bulk`, { people: [{ name: 'X', cluster_id: theirs.id }, { name: 'Y', cluster_id: old.id }] }),
        BulkProfilesResponseSchema,
      );
      expect(body.created).toEqual([]);
      expect(body.errors).toHaveLength(2);
    });

    it('accepts 1000 people and refuses 1001 or none', async () => {
      const { admin, accountId } = await setup();
      const make = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
      const over = await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, { people: make(1001) });
      expect(over.statusCode).toBe(400);
      expect((await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, { people: [] })).statusCode).toBe(400);
      const rows = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId));
      expect(rows).toHaveLength(2);
    });

    it('creates 1000 people in one request', async () => {
      const { admin, accountId } = await setup();
      const people = Array.from({ length: 1000 }, (_, i) => ({ name: `P${i}`, cluster_name: i % 2 ? 'Odd' : 'Even' }));
      const res = await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, { people });
      const body = expectShape(res, BulkProfilesResponseSchema);
      expect(body.created).toHaveLength(1000);
      expect(body.seats.used).toBe(1002);
    }, 120_000);

    it('never blocks at the seat limit: the response reports over=false while there is no limit', async () => {
      const { admin, accountId } = await setup();
      expect(await seatLimitFor(accountId)).toBeNull();
      const body = expectShape(await send('POST', admin.token, `/api/accounts/${accountId}/profiles/bulk`, { people: [{ name: 'One' }] }), BulkProfilesResponseSchema);
      expect(body.seats.over).toBe(false);
    });

    it('adds only to the org it was sent to', async () => {
      const a = await setup();
      const b = await setup();
      await send('POST', a.admin.token, `/api/accounts/${a.accountId}/profiles/bulk`, { people: [{ name: 'Only A' }] });
      const rows = await db.select().from(profiles).where(and(eq(profiles.account_id, b.accountId), eq(profiles.name, 'Only A')));
      expect(rows).toEqual([]);
    });
  });

  describe('over-seat notice', () => {
    it('tells the super admins once, only when a change first goes over the limit', async () => {
      const { accountId } = await setup();
      env.superAdminEmails.add('boss@example.com');
      try {
        expect(await notifyIfOverSeats(accountId, 20, 25, 25)).toBe(false); // at the limit
        expect(await notifyIfOverSeats(accountId, 25, 27, 25)).toBe(true); // crossed
        expect(getLastMailMessage()?.to).toBe('boss@example.com');
        expect(getLastMailMessage()?.text).toContain('27 people on a plan for 25');
        expect(await notifyIfOverSeats(accountId, 27, 30, 25)).toBe(false); // already over
        expect(await notifyIfOverSeats(accountId, 5, 30, null)).toBe(false); // no limit
      } finally {
        env.superAdminEmails.delete('boss@example.com');
      }
    });
  });

  describe('households and individuals are unchanged', () => {
    it('creates a profile in a household exactly as before, with no cluster or archive', async () => {
      const admin = await createUser();
      const accountId = await createAccount(admin.id, 'household');
      await addMember(accountId, admin.id, 'admin');
      const res = await send('POST', admin.token, `/api/accounts/${accountId}/profiles`, { name: 'Kid' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: 'Kid', cluster_id: null, archived_at: null });
      const list = (await get(admin.token, `/api/accounts/${accountId}/profiles`)).json() as unknown[];
      expect(list).toHaveLength(1);
    });
  });
});
