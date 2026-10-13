import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { cluster_members, clusters } from '../src/db/schema/clusters.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { canAccessProfile, canWriteProfile } from '../src/plugins/auth.js';
import { ClustersResponseSchema, RosterResponseSchema } from '@chipperly/shared/schemas/org';
import { buildTestApp, expectShape, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser, type TestUser } from './fixtures.js';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;

async function makeGroup(accountId: string, name: string): Promise<string> {
  const id = uuidv7();
  await db.insert(clusters).values({ id, account_id: accountId, name, archived_at: null, created_at: Date.now() });
  return id;
}

async function assign(accountId: string, userId: string, clusterId: string): Promise<void> {
  await db.insert(cluster_members).values({ user_id: userId, cluster_id: clusterId, account_id: accountId, created_at: Date.now() });
}

async function putInGroup(profileId: string, clusterId: string | null, archived = false): Promise<void> {
  await db.update(profiles).set({ cluster_id: clusterId, archived_at: archived ? Date.now() : null }).where(eq(profiles.id, profileId));
}

describe('groups, moderators and group access', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (token: string, url: string) => request(app, { method: 'GET', url, headers: auth(token) });
  const send = (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', token: string, url: string, payload?: unknown) =>
    request(app, { method, url, headers: auth(token), ...(payload === undefined ? {} : { payload: payload as object }) });

  /**
   * An organization with groups North and South. North has Ann, Al and Archie (archived); South has Sue.
   * Cal has no group. mod moderates North, staff (member), family (viewer) are in North,
   * southStaff is in South, loner has no group and no direct person.
   */
  async function setup() {
    const admin = await createUser('Olga Owner');
    const accountId = await createAccount(admin.id, 'agency', 'Bright Steps');
    await addMember(accountId, admin.id, 'admin');
    const north = await makeGroup(accountId, 'North');
    const south = await makeGroup(accountId, 'South');
    const ann = await createProfile(accountId, admin.id, 'Ann');
    const al = await createProfile(accountId, admin.id, 'Al');
    const archie = await createProfile(accountId, admin.id, 'Archie');
    const sue = await createProfile(accountId, admin.id, 'Sue');
    const cal = await createProfile(accountId, admin.id, 'Cal');
    await putInGroup(ann, north);
    await putInGroup(al, north);
    await putInGroup(archie, north, true);
    await putInGroup(sue, south);

    const mod = await createUser('Mo Moderator');
    await addMember(accountId, mod.id, 'moderator');
    await assign(accountId, mod.id, north);
    const staff = await createUser('Sam Staff');
    await addMember(accountId, staff.id, 'member');
    await assign(accountId, staff.id, north);
    const family = await createUser('Pat Parent');
    await addMember(accountId, family.id, 'viewer');
    await assign(accountId, family.id, north);
    const southStaff = await createUser('Sol Staff');
    await addMember(accountId, southStaff.id, 'member');
    await assign(accountId, southStaff.id, south);
    const loner = await createUser('Lou Loner');
    await addMember(accountId, loner.id, 'member');
    return { admin, mod, staff, family, southStaff, loner, accountId, north, south, ann, al, archie, sue, cal };
  }

  const path = (accountId: string, rest: string) => `/api/accounts/${accountId}${rest}`;

  describe('read access by group', () => {
    it('canAccessProfile: group people, not other groups, not archived, not ungrouped', async () => {
      const s = await setup();
      for (const u of [s.mod, s.staff, s.family]) {
        expect(await canAccessProfile(u.id, s.ann)).toBe(true);
        expect(await canAccessProfile(u.id, s.al)).toBe(true);
        expect(await canAccessProfile(u.id, s.sue)).toBe(false);
        expect(await canAccessProfile(u.id, s.archie)).toBe(false);
        expect(await canAccessProfile(u.id, s.cal)).toBe(false);
      }
      expect(await canAccessProfile(s.southStaff.id, s.sue)).toBe(true);
      expect(await canAccessProfile(s.southStaff.id, s.ann)).toBe(false);
      expect(await canAccessProfile(s.loner.id, s.ann)).toBe(false);
      expect(await canAccessProfile(s.admin.id, s.archie)).toBe(true);
    });

    it('direct assignment still works next to a group, and a person who leaves the group disappears', async () => {
      const s = await setup();
      await db.insert(profile_members).values({ profile_id: s.sue, user_id: s.staff.id, relationship_label: null });
      expect(await canAccessProfile(s.staff.id, s.sue)).toBe(true);
      await putInGroup(s.ann, s.south);
      expect(await canAccessProfile(s.staff.id, s.ann)).toBe(false);
      expect(await canAccessProfile(s.southStaff.id, s.ann)).toBe(true);
    });

    it('sync pull follows the same rule', async () => {
      const s = await setup();
      const ok = await get(s.staff.token, `/api/sync/pull?profile_id=${s.ann}&since=0`);
      expect(ok.statusCode).toBe(200);
      const other = await get(s.staff.token, `/api/sync/pull?profile_id=${s.sue}&since=0`);
      expect(other.statusCode).toBe(403);
      const archived = await get(s.mod.token, `/api/sync/pull?profile_id=${s.archie}&since=0`);
      expect(archived.statusCode).toBe(403);
    });

    it('lists only group people in /accounts/:id/profiles and /me', async () => {
      const s = await setup();
      const list = await get(s.staff.token, path(s.accountId, '/profiles'));
      expect((list.json() as Array<{ id: string }>).map((p) => p.id).sort()).toEqual([s.ann, s.al].sort());
      const me = await get(s.family.token, '/api/me');
      const body = me.json() as { profiles: Array<{ id: string }> };
      expect(body.profiles.map((p) => p.id).sort()).toEqual([s.ann, s.al].sort());
      const none = await get(s.loner.token, path(s.accountId, '/profiles'));
      expect(none.json()).toEqual([]);
    });

    it('/me tells each member the account owner, and the moderator role', async () => {
      const s = await setup();
      const me = await get(s.mod.token, '/api/me');
      const body = me.json() as { accounts: Array<{ role: string; account: { owner_user_id: string } }> };
      expect(body.accounts[0]).toMatchObject({ role: 'moderator', account: { owner_user_id: s.admin.id } });
    });

    it('roster is scoped: group people only, with archived ones only for the moderator', async () => {
      const s = await setup();
      const staffRoster = expectShape(await get(s.staff.token, path(s.accountId, '/roster?status=all')), RosterResponseSchema);
      expect(staffRoster.people.map((p) => p.name)).toEqual(['Al', 'Ann']);
      const modRoster = expectShape(await get(s.mod.token, path(s.accountId, '/roster?status=all')), RosterResponseSchema);
      expect(modRoster.people.map((p) => p.name)).toEqual(['Al', 'Ann', 'Archie']);
      const modActive = expectShape(await get(s.mod.token, path(s.accountId, '/roster')), RosterResponseSchema);
      expect(modActive.people.map((p) => p.name)).toEqual(['Al', 'Ann']);
      const adminRoster = expectShape(await get(s.admin.token, path(s.accountId, '/roster?status=all')), RosterResponseSchema);
      expect(adminRoster.people).toHaveLength(5);
    });

    it("a person's team includes the staff assigned to their group; families only see staff and themselves", async () => {
      const s = await setup();
      const modRoster = expectShape(await get(s.mod.token, path(s.accountId, '/roster')), RosterResponseSchema);
      const ann = modRoster.people.find((p) => p.name === 'Ann')!;
      expect(ann.team.map((t) => t.display_name).sort()).toEqual(['Mo Moderator', 'Pat Parent', 'Sam Staff']);
      expect(ann.team.find((t) => t.display_name === 'Mo Moderator')?.role).toBe('moderator');
      const familyRoster = expectShape(await get(s.family.token, path(s.accountId, '/roster')), RosterResponseSchema);
      const seen = familyRoster.people.find((p) => p.name === 'Ann')!.team.map((t) => t.display_name).sort();
      expect(seen).toEqual(['Mo Moderator', 'Pat Parent', 'Sam Staff']);
      const other = await createUser('Other Parent');
      await addMember(s.accountId, other.id, 'viewer');
      await assign(s.accountId, other.id, s.north);
      const again = expectShape(await get(s.family.token, path(s.accountId, '/roster')), RosterResponseSchema);
      expect(again.people.find((p) => p.name === 'Ann')!.team.map((t) => t.display_name)).not.toContain('Other Parent');
    });

    it('groups list: admin sees all with staff, moderator sees own with staff, staff sees own without staff', async () => {
      const s = await setup();
      const admin = expectShape(await get(s.admin.token, path(s.accountId, '/clusters')), ClustersResponseSchema);
      expect(admin.clusters.map((c) => c.name)).toEqual(['North', 'South']);
      expect(admin.clusters.find((c) => c.name === 'North')?.staff?.map((x) => x.display_name).sort()).toEqual(['Mo Moderator', 'Pat Parent', 'Sam Staff']);
      const mod = expectShape(await get(s.mod.token, path(s.accountId, '/clusters')), ClustersResponseSchema);
      expect(mod.clusters.map((c) => c.name)).toEqual(['North']);
      expect(mod.clusters[0]?.profile_count).toBe(2);
      expect(mod.clusters[0]?.staff).toHaveLength(3);
      const staff = expectShape(await get(s.staff.token, path(s.accountId, '/clusters')), ClustersResponseSchema);
      expect(staff.clusters.map((c) => c.name)).toEqual(['North']);
      expect(staff.clusters[0]?.staff).toBeUndefined();
    });
  });

  describe('write access by group', () => {
    it('staff in a group can write its people, a viewer in the group is read only', async () => {
      const s = await setup();
      expect(await canWriteProfile(s.staff.id, s.ann)).toBe(true);
      expect(await canWriteProfile(s.mod.id, s.al)).toBe(true);
      expect(await canWriteProfile(s.staff.id, s.sue)).toBe(false);

      const push = (token: string, profileId: string) =>
        send('POST', token, '/api/sync/push', {
          profile_id: profileId,
          mutations: [{ table: 'activities', id: uuidv7(), op: 'upsert', row: { not: 'valid' }, client_updated_at: Date.now() }],
        });
      const staffRes = await push(s.staff.token, s.ann);
      expect(staffRes.statusCode).toBe(200);
      expect((staffRes.json() as { rejected: Array<{ reason: string }> }).rejected[0]?.reason).toBe('invalid');
      const viewerRes = await push(s.family.token, s.ann);
      expect(viewerRes.statusCode).toBe(200);
      expect((viewerRes.json() as { rejected: Array<{ reason: string }> }).rejected[0]?.reason).toBe('read_only');
      const outside = await push(s.staff.token, s.sue);
      expect(outside.statusCode).toBe(403);
    });

    it('a viewer in a group is refused by write routes with read_only', async () => {
      const s = await setup();
      const res = await send('POST', s.family.token, `/api/profiles/${s.ann}/location-changed`, {});
      expect(res.statusCode).toBe(403);
      expect(codeOf(res)).toBe('read_only');
    });

    it('sync push cannot set a person group or archive state for a moderator', async () => {
      const s = await setup();
      const [row] = await db.select().from(profiles).where(eq(profiles.id, s.ann)).limit(1);
      const res = await send('POST', s.mod.token, '/api/sync/push', {
        profile_id: s.ann,
        mutations: [{ table: 'profiles', id: s.ann, op: 'upsert', row: { ...row, cluster_id: s.south, archived_at: Date.now() }, client_updated_at: Date.now() + 1000 }],
      });
      expect(res.statusCode).toBe(200);
      const [after] = await db.select().from(profiles).where(eq(profiles.id, s.ann)).limit(1);
      expect(after?.cluster_id).toBe(s.north);
      expect(after?.archived_at).toBeNull();
    });
  });

  describe('groups are admin only', () => {
    it('a moderator cannot create, rename or archive a group, nor change org settings or bulk add', async () => {
      const s = await setup();
      expect((await send('POST', s.mod.token, path(s.accountId, '/clusters'), { name: 'East' })).statusCode).toBe(403);
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/clusters/${s.north}`), { name: 'Renamed' })).statusCode).toBe(403);
      expect((await send('PATCH', s.mod.token, path(s.accountId, '/org'), { name: 'Mine now' })).statusCode).toBe(403);
      expect((await send('POST', s.mod.token, path(s.accountId, '/profiles/bulk'), { people: [{ name: 'X' }] })).statusCode).toBe(403);
      expect((await send('POST', s.mod.token, path(s.accountId, '/profiles'), { name: 'New kid' })).statusCode).toBe(403);
    });
  });

  describe('moderator: moving and archiving people', () => {
    it('moves people between their own groups only', async () => {
      const s = await setup();
      const second = await makeGroup(s.accountId, 'North 2');
      await assign(s.accountId, s.mod.id, second);
      const ok = await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.ann}`), { cluster_id: second });
      expect(ok.statusCode).toBe(200);
      expect((await db.select().from(profiles).where(eq(profiles.id, s.ann)))[0]?.cluster_id).toBe(second);

      const toSouth = await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.al}`), { cluster_id: s.south });
      expect(toSouth.statusCode).toBe(403);
      const toNone = await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.al}`), { cluster_id: null });
      expect(toNone.statusCode).toBe(403);
    });

    it('cannot touch people outside their groups', async () => {
      const s = await setup();
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.sue}`), { archived: true })).statusCode).toBe(404);
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.cal}`), { cluster_id: s.north })).statusCode).toBe(404);
      expect((await db.select().from(profiles).where(eq(profiles.id, s.sue)))[0]?.archived_at).toBeNull();
    });

    it('archives and restores people in their groups', async () => {
      const s = await setup();
      const arch = await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.ann}`), { archived: true });
      expect(arch.statusCode).toBe(200);
      expect(await canAccessProfile(s.staff.id, s.ann)).toBe(false);
      const back = await send('PATCH', s.mod.token, path(s.accountId, `/profiles/${s.archie}`), { archived: false });
      expect(back.statusCode).toBe(200);
      expect(await canAccessProfile(s.staff.id, s.archie)).toBe(true);
    });

    it('staff and family cannot move or archive anyone', async () => {
      const s = await setup();
      const staffRes = await send('PATCH', s.staff.token, path(s.accountId, `/profiles/${s.ann}`), { archived: true });
      expect(staffRes.statusCode).toBe(403);
      const familyRes = await send('PATCH', s.family.token, path(s.accountId, `/profiles/${s.ann}`), { archived: true });
      expect(familyRes.statusCode).toBe(403);
      expect(codeOf(familyRes)).toBe('read_only');
    });
  });

  describe('moderator: invites', () => {
    it('invites Staff and Family into their groups, and the invitee lands in the group', async () => {
      const s = await setup();
      const res = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'new@example.com', role: 'member', profile_ids: [], cluster_ids: [s.north] });
      expect(res.statusCode).toBe(201);
      const invite = res.json() as { invite_url: string; cluster_ids: string[] };
      expect(invite.cluster_ids).toEqual([s.north]);
      const newcomer = await createUser('Newcomer');
      const accept = await send('POST', newcomer.token, `/api/invites/${invite.invite_url.split('token=')[1]}/accept`);
      expect(accept.statusCode).toBe(200);
      expect(await canAccessProfile(newcomer.id, s.ann)).toBe(true);
      expect(await canAccessProfile(newcomer.id, s.sue)).toBe(false);
      const rows = await db.select().from(cluster_members).where(and(eq(cluster_members.user_id, newcomer.id), eq(cluster_members.account_id, s.accountId)));
      expect(rows.map((r) => r.cluster_id)).toEqual([s.north]);
    });

    it('invites a family to one person in their group', async () => {
      const s = await setup();
      const res = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'fam@example.com', role: 'viewer', profile_ids: [s.ann] });
      expect(res.statusCode).toBe(201);
    });

    it('cannot invite admins or moderators', async () => {
      const s = await setup();
      for (const role of ['admin', 'moderator']) {
        const res = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: `${role}@example.com`, role, profile_ids: [], cluster_ids: [s.north] });
        expect(res.statusCode).toBe(403);
      }
    });

    it('cannot invite into other groups, to other people, or to nothing', async () => {
      const s = await setup();
      const group = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'a@example.com', role: 'member', profile_ids: [], cluster_ids: [s.south] });
      expect(group.statusCode).toBe(403);
      const person = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'b@example.com', role: 'viewer', profile_ids: [s.sue] });
      expect(person.statusCode).toBe(403);
      const mixed = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'c@example.com', role: 'member', profile_ids: [s.ann], cluster_ids: [s.north, s.south] });
      expect(mixed.statusCode).toBe(403);
      const nothing = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'd@example.com', role: 'member', profile_ids: [] });
      expect(nothing.statusCode).toBe(400);
    });

    it('an admin can invite a moderator, staff cannot invite anyone', async () => {
      const s = await setup();
      const ok = await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'm@example.com', role: 'moderator', profile_ids: [], cluster_ids: [s.north, s.south] });
      expect(ok.statusCode).toBe(201);
      const staff = await send('POST', s.staff.token, path(s.accountId, '/invites'), { email: 'x@example.com', role: 'member', profile_ids: [s.ann] });
      expect(staff.statusCode).toBe(403);
      const family = await send('POST', s.family.token, path(s.accountId, '/invites'), { email: 'y@example.com', role: 'viewer', profile_ids: [s.ann] });
      expect(family.statusCode).toBe(403);
    });

    it('rejects groups from another account and archived groups', async () => {
      const s = await setup();
      const other = await createUser('Other Admin');
      const otherAccount = await createAccount(other.id, 'agency', 'Elsewhere');
      await addMember(otherAccount, other.id, 'admin');
      const foreign = await makeGroup(otherAccount, 'Foreign');
      const res = await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'z@example.com', role: 'member', profile_ids: [], cluster_ids: [foreign] });
      expect(res.statusCode).toBe(400);
      expect(codeOf(res)).toBe('invalid_groups');
      await db.update(clusters).set({ archived_at: Date.now() }).where(eq(clusters.id, s.south));
      const archived = await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'w@example.com', role: 'member', profile_ids: [], cluster_ids: [s.south] });
      expect(archived.statusCode).toBe(400);
    });

    it('a moderator cannot resend or delete an invite for someone else\'s group', async () => {
      const s = await setup();
      const made = await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'south@example.com', role: 'member', profile_ids: [], cluster_ids: [s.south] });
      const { id } = made.json() as { id: string };
      expect((await send('POST', s.mod.token, path(s.accountId, `/invites/${id}/resend`))).statusCode).toBe(403);
      expect((await send('DELETE', s.mod.token, path(s.accountId, `/invites/${id}`))).statusCode).toBe(403);
      const own = await send('POST', s.mod.token, path(s.accountId, '/invites'), { email: 'north@example.com', role: 'member', profile_ids: [], cluster_ids: [s.north] });
      const ownId = (own.json() as { id: string }).id;
      expect((await send('POST', s.mod.token, path(s.accountId, `/invites/${ownId}/resend`))).statusCode).toBe(200);
      expect((await send('DELETE', s.mod.token, path(s.accountId, `/invites/${ownId}`))).statusCode).toBe(200);
    });

    it('households refuse moderators and groups', async () => {
      const admin = await createUser('Hana');
      const accountId = await createAccount(admin.id, 'household');
      await addMember(accountId, admin.id, 'admin');
      const pid = await createProfile(accountId, admin.id);
      const res = await send('POST', admin.token, path(accountId, '/invites'), { email: 'h@example.com', role: 'moderator', profile_ids: [pid] });
      expect(res.statusCode).toBe(400);
      expect(codeOf(res)).toBe('org_only');
      const groupRes = await send('POST', admin.token, path(accountId, '/invites'), { email: 'g@example.com', role: 'member', profile_ids: [pid], cluster_ids: [uuidv7()] });
      expect(groupRes.statusCode).toBe(400);
      const other = await createUser('Helper');
      await addMember(accountId, other.id, 'member');
      const patch = await send('PATCH', admin.token, path(accountId, `/members/${other.id}`), { role: 'moderator' });
      expect(patch.statusCode).toBe(400);
    });
  });

  describe('moderator: editing and removing members', () => {
    it('edits Staff and Family inside their groups', async () => {
      const s = await setup();
      const res = await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.staff.id}`), { role: 'viewer' });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { role: string }).role).toBe('viewer');
      const people = await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.family.id}`), { profile_ids: [s.ann] });
      expect(people.statusCode).toBe(200);
    });

    it('cannot promote anyone to admin or moderator', async () => {
      const s = await setup();
      for (const role of ['admin', 'moderator']) {
        const res = await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.staff.id}`), { role });
        expect(res.statusCode).toBe(403);
      }
      const self = await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.mod.id}`), { role: 'admin' });
      expect(self.statusCode).toBe(403);
    });

    it('cannot edit or remove admins or other moderators', async () => {
      const s = await setup();
      const mod2 = await createUser('Mia Moderator');
      await addMember(s.accountId, mod2.id, 'moderator');
      await assign(s.accountId, mod2.id, s.north);
      for (const target of [s.admin, mod2]) {
        expect((await send('PATCH', s.mod.token, path(s.accountId, `/members/${target.id}`), { role: 'viewer' })).statusCode).toBe(403);
        expect((await send('DELETE', s.mod.token, path(s.accountId, `/members/${target.id}`))).statusCode).toBe(403);
        expect((await send('PUT', s.mod.token, path(s.accountId, `/members/${target.id}/groups`), { cluster_ids: [s.north] })).statusCode).toBe(403);
      }
    });

    it('cannot edit Staff outside their groups, partly outside, or with no access yet', async () => {
      const s = await setup();
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.southStaff.id}`), { role: 'viewer' })).statusCode).toBe(403);
      await assign(s.accountId, s.staff.id, s.south); // now also in South: not entirely inside North
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.staff.id}`), { role: 'viewer' })).statusCode).toBe(403);
      expect((await send('DELETE', s.mod.token, path(s.accountId, `/members/${s.staff.id}`))).statusCode).toBe(403);
      expect((await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.loner.id}`), { role: 'viewer' })).statusCode).toBe(403);
    });

    it('cannot hand out people outside their groups', async () => {
      const s = await setup();
      const res = await send('PATCH', s.mod.token, path(s.accountId, `/members/${s.staff.id}`), { profile_ids: [s.sue] });
      expect(res.statusCode).toBe(403);
    });

    it('removes Staff inside their groups, group assignment included', async () => {
      const s = await setup();
      const res = await send('DELETE', s.mod.token, path(s.accountId, `/members/${s.staff.id}`));
      expect(res.statusCode).toBe(200);
      const rows = await db.select().from(cluster_members).where(eq(cluster_members.user_id, s.staff.id));
      expect(rows).toEqual([]);
    });

    it('staff and family cannot edit anyone', async () => {
      const s = await setup();
      expect((await send('PATCH', s.staff.token, path(s.accountId, `/members/${s.family.id}`), { role: 'admin' })).statusCode).toBe(403);
      const fam = await send('DELETE', s.family.token, path(s.accountId, `/members/${s.staff.id}`));
      expect(fam.statusCode).toBe(403);
      expect(codeOf(fam)).toBe('read_only');
    });

    it('an admin can make a moderator, and the member list shows each person\'s groups', async () => {
      const s = await setup();
      const res = await send('PATCH', s.admin.token, path(s.accountId, `/members/${s.staff.id}`), { role: 'moderator' });
      expect(res.statusCode).toBe(200);
      const list = await get(s.mod.token, path(s.accountId, '/members'));
      const members = (list.json() as { members: Array<{ user: { id: string }; role: string; cluster_ids?: string[] }> }).members;
      expect(members.find((m) => m.user.id === s.staff.id)).toMatchObject({ role: 'moderator', cluster_ids: [s.north] });
      expect(members.find((m) => m.user.id === s.southStaff.id)).toBeUndefined();
      const all = await get(s.admin.token, path(s.accountId, '/members'));
      expect((all.json() as { members: Array<{ user: { id: string }; cluster_ids?: string[] }> }).members.find((m) => m.user.id === s.southStaff.id)?.cluster_ids).toEqual([s.south]);
    });

    it('making someone admin clears their groups', async () => {
      const s = await setup();
      await send('PATCH', s.admin.token, path(s.accountId, `/members/${s.staff.id}`), { role: 'admin' });
      expect(await db.select().from(cluster_members).where(eq(cluster_members.user_id, s.staff.id))).toEqual([]);
    });
  });

  describe('PUT /accounts/:id/members/:user_id/groups', () => {
    it('an admin sets groups for Staff, Family and moderators', async () => {
      const s = await setup();
      const res = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [s.north, s.south] });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { cluster_ids: string[] }).cluster_ids.sort()).toEqual([s.north, s.south].sort());
      expect(await canAccessProfile(s.loner.id, s.sue)).toBe(true);
      const replace = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [s.south] });
      expect(replace.statusCode).toBe(200);
      expect(await canAccessProfile(s.loner.id, s.ann)).toBe(false);
      const clear = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [] });
      expect(clear.statusCode).toBe(200);
      expect(await canAccessProfile(s.loner.id, s.sue)).toBe(false);
      expect((await send('PUT', s.admin.token, path(s.accountId, `/members/${s.mod.id}/groups`), { cluster_ids: [s.north, s.south] })).statusCode).toBe(200);
    });

    it('refuses admins, unknown groups, archived groups and unknown people', async () => {
      const s = await setup();
      const admin = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.admin.id}/groups`), { cluster_ids: [s.north] });
      expect(admin.statusCode).toBe(409);
      const unknown = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.staff.id}/groups`), { cluster_ids: [uuidv7()] });
      expect(unknown.statusCode).toBe(400);
      await db.update(clusters).set({ archived_at: Date.now() }).where(eq(clusters.id, s.south));
      const archived = await send('PUT', s.admin.token, path(s.accountId, `/members/${s.staff.id}/groups`), { cluster_ids: [s.south] });
      expect(archived.statusCode).toBe(400);
      const nobody = await send('PUT', s.admin.token, path(s.accountId, `/members/${uuidv7()}/groups`), { cluster_ids: [] });
      expect(nobody.statusCode).toBe(404);
    });

    it('a moderator assigns only inside their groups', async () => {
      const s = await setup();
      const second = await makeGroup(s.accountId, 'North 2');
      await assign(s.accountId, s.mod.id, second);
      const ok = await send('PUT', s.mod.token, path(s.accountId, `/members/${s.staff.id}/groups`), { cluster_ids: [s.north, second] });
      expect(ok.statusCode).toBe(200);
      const outside = await send('PUT', s.mod.token, path(s.accountId, `/members/${s.staff.id}/groups`), { cluster_ids: [s.south] });
      expect(outside.statusCode).toBe(403);
      const other = await send('PUT', s.mod.token, path(s.accountId, `/members/${s.southStaff.id}/groups`), { cluster_ids: [s.north] });
      expect(other.statusCode).toBe(403);
    });

    it('staff, family and strangers cannot assign groups; households are not organizations', async () => {
      const s = await setup();
      expect((await send('PUT', s.staff.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [s.north] })).statusCode).toBe(403);
      const fam = await send('PUT', s.family.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [s.north] });
      expect(fam.statusCode).toBe(403);
      expect(codeOf(fam)).toBe('read_only');
      const stranger = await createUser('Stranger');
      expect((await send('PUT', stranger.token, path(s.accountId, `/members/${s.loner.id}/groups`), { cluster_ids: [] })).statusCode).toBe(403);

      const hh = await createUser('Hana');
      const hhAccount = await createAccount(hh.id, 'household');
      await addMember(hhAccount, hh.id, 'admin');
      const helper = await createUser('Helper');
      await addMember(hhAccount, helper.id, 'member');
      const res = await send('PUT', hh.token, path(hhAccount, `/members/${helper.id}/groups`), { cluster_ids: [] });
      expect(res.statusCode).toBe(409);
      expect(codeOf(res)).toBe('not_an_org');
    });
  });

  describe('team list visibility', () => {
    type Team = { members: Array<{ user: { id: string } }>; invites: Array<{ email: string }> };
    const team = async (token: string, accountId: string) => (await get(token, path(accountId, '/members'))).json() as Team;
    const ids = (t: Team) => t.members.map((m) => m.user.id).sort();

    it('admin sees everyone, a moderator only people inside their groups, others only themselves and the staff on their people', async () => {
      const s = await setup();
      await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'north@example.com', role: 'member', profile_ids: [], cluster_ids: [s.north] });
      await send('POST', s.admin.token, path(s.accountId, '/invites'), { email: 'south@example.com', role: 'member', profile_ids: [], cluster_ids: [s.south] });

      const admin = await team(s.admin.token, s.accountId);
      expect(ids(admin)).toEqual([s.admin, s.mod, s.staff, s.family, s.southStaff, s.loner].map((u) => u.id).sort());
      expect(admin.invites.map((i) => i.email).sort()).toEqual(['north@example.com', 'south@example.com']);

      const mod = await team(s.mod.token, s.accountId);
      expect(ids(mod)).toEqual([s.admin, s.mod, s.staff, s.family].map((u) => u.id).sort());
      expect(mod.invites.map((i) => i.email)).toEqual(['north@example.com']);

      // Staff and Family: themselves plus the non-Family users on their people. No invites.
      const staff = await team(s.staff.token, s.accountId);
      expect(ids(staff)).toEqual([s.admin, s.mod, s.staff].map((u) => u.id).sort());
      expect(staff.invites).toEqual([]);
      const family = await team(s.family.token, s.accountId);
      expect(ids(family)).toEqual([s.admin, s.mod, s.staff, s.family].map((u) => u.id).sort());
      expect(family.invites).toEqual([]);
      expect(ids(await team(s.loner.token, s.accountId))).toEqual([s.admin.id, s.loner.id].sort());
    });

    it('the account report lists only staff in the moderator\'s groups', async () => {
      const s = await setup();
      const mod = (await get(s.mod.token, path(s.accountId, '/report'))).json() as { staff: Array<{ user_id: string }> };
      expect(mod.staff.map((x) => x.user_id).sort()).toEqual([s.mod.id, s.staff.id].sort());
      const admin = (await get(s.admin.token, path(s.accountId, '/report'))).json() as { staff: Array<{ user_id: string }> };
      expect(admin.staff.map((x) => x.user_id)).toContain(s.southStaff.id);
    });

    it('a moderator is offered only their own groups, even when a person of theirs sits in another', async () => {
      const s = await setup();
      await db.insert(profile_members).values({ profile_id: s.sue, user_id: s.mod.id, relationship_label: null });
      const mod = expectShape(await get(s.mod.token, path(s.accountId, '/clusters')), ClustersResponseSchema);
      expect(mod.clusters.map((c) => c.name)).toEqual(['North']);
    });
  });

  describe('households keep working', () => {
    it('a household member sees only assigned people, as before', async () => {
      const admin = await createUser('Hana');
      const accountId = await createAccount(admin.id, 'household');
      await addMember(accountId, admin.id, 'admin');
      const a = await createProfile(accountId, admin.id, 'A');
      await createProfile(accountId, admin.id, 'B');
      const helper = await createUser('Helper');
      await addMember(accountId, helper.id, 'member');
      await db.insert(profile_members).values({ profile_id: a, user_id: helper.id, relationship_label: null });
      const list = await get(helper.token, path(accountId, '/profiles'));
      expect((list.json() as Array<{ id: string }>).map((p) => p.id)).toEqual([a]);
      const members = await get(admin.token, path(accountId, '/members'));
      expect(members.statusCode).toBe(200);
    });
  });
});
