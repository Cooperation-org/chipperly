import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../src/db/client.js';
import { attitude_checks } from '../src/db/schema/attitude.js';
import { chip_ledger } from '../src/db/schema/chips.js';
import { cluster_members, clusters } from '../src/db/schema/clusters.js';
import { profile_members, profiles } from '../src/db/schema/profiles.js';
import { day_plans, schedule_items } from '../src/db/schema/schedule.js';
import type { AccountReport, ProfileReport } from '@chipperly/shared/schemas/report';
import { buildTestApp, request } from './helpers.js';
import { addMember, createAccount, createProfile, createUser } from './fixtures.js';
import { eq } from 'drizzle-orm';

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe('reports', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  const get = (token: string, url: string) => request(app, { method: 'GET', url, headers: auth(token) });

  async function item(profileId: string, by: string, date: string, done: boolean) {
    await db.insert(schedule_items).values({
      id: uuidv7(), profile_id: profileId, client_updated_at: Date.now(), updated_by: by, date, position: 0, activity_id: uuidv7(), source: 'manual',
      completed_at: done ? Date.parse(`${date}T12:00:00Z`) : null, completed_by: done ? by : null,
    });
  }
  async function chip(profileId: string, by: string, delta: number, daysAgo: number) {
    await db.insert(chip_ledger).values({
      id: uuidv7(), profile_id: profileId, client_updated_at: Date.now(), updated_by: by, delta, reason: delta > 0 ? 'task' : 'redeem',
      created_at: Date.now() - daysAgo * 86_400_000, created_by: by,
    });
  }

  /** An agency with admin, staff on Ava, a family viewer on Ava, and Ben who nobody but the admin sees. */
  async function setup() {
    const admin = await createUser('Olga Owner');
    const accountId = await createAccount(admin.id, 'agency', 'Bright Steps');
    await addMember(accountId, admin.id, 'admin');
    const group = uuidv7();
    await db.insert(clusters).values({ id: group, account_id: accountId, name: 'North, "clinic"', archived_at: null, created_at: Date.now() });
    const ava = await createProfile(accountId, admin.id, 'Ava');
    const ben = await createProfile(accountId, admin.id, 'Ben');
    await db.update(profiles).set({ cluster_id: group }).where(eq(profiles.id, ava));
    const staff = await createUser('Sam Staff');
    await addMember(accountId, staff.id, 'member');
    await db.insert(profile_members).values({ profile_id: ava, user_id: staff.id, relationship_label: null });
    const parent = await createUser('Pat Parent');
    await addMember(accountId, parent.id, 'viewer');
    await db.insert(profile_members).values({ profile_id: ava, user_id: parent.id, relationship_label: null });
    return { admin, staff, parent, accountId, ava, ben, group };
  }

  it('adds up a person by day from stored data', async () => {
    const { admin, staff, ava } = await setup();
    await item(ava, staff.id, iso(0), true);
    await item(ava, staff.id, iso(0), true);
    await item(ava, staff.id, iso(0), false);
    await item(ava, staff.id, iso(2), true);
    await item(ava, staff.id, iso(40), true); // outside the window
    await chip(ava, admin.id, 5, 0);
    await chip(ava, admin.id, 3, 0);
    await chip(ava, admin.id, -4, 0);
    await db.insert(attitude_checks).values([
      { id: uuidv7(), profile_id: ava, client_updated_at: Date.now(), updated_by: admin.id, value: 'good', feeling: 4, kind: null, note: null, created_at: Date.now(), created_by: admin.id },
      { id: uuidv7(), profile_id: ava, client_updated_at: Date.now(), updated_by: admin.id, value: 'good', feeling: 4, kind: null, note: 'Calm after lunch', created_at: Date.now(), created_by: staff.id },
    ]);
    await db.insert(day_plans).values({ id: uuidv7(), profile_id: ava, client_updated_at: Date.now(), updated_by: admin.id, date: iso(1), note: 'Dentist at 3' });

    const res = await get(staff.token, `/api/profiles/${ava}/report?days=7`);
    expect(res.statusCode).toBe(200);
    const r = res.json() as ProfileReport;
    expect(r.days).toHaveLength(7);
    const today = r.days.at(-1)!;
    expect(today).toMatchObject({ date: iso(0), tasks_done: 2, tasks_planned: 3, chips_earned: 8, chips_spent: 4 });
    expect(today.feelings).toEqual([0, 0, 0, 2, 0]);
    expect(r.days.find((d) => d.date === iso(2))).toMatchObject({ tasks_done: 1, tasks_planned: 1 });
    expect(r.notes).toEqual([
      { date: iso(0), author: 'Sam Staff', text: 'Calm after lunch' },
      { date: iso(1), author: 'Olga Owner', text: 'Dentist at 3' },
    ].sort((a, b) => b.date.localeCompare(a.date)));

    const r30 = (await get(staff.token, `/api/profiles/${ava}/report?days=30`)).json() as ProfileReport;
    expect(r30.days).toHaveLength(30);
    expect(r30.days.reduce((n, d) => n + d.tasks_done, 0)).toBe(3);
  });

  it('scopes a person report: viewer only their person, a stranger or other staff get 403', async () => {
    const { parent, staff, admin, ava, ben } = await setup();
    expect((await get(parent.token, `/api/profiles/${ava}/report`)).statusCode).toBe(200);
    expect((await get(parent.token, `/api/profiles/${ben}/report`)).statusCode).toBe(403);
    expect((await get(staff.token, `/api/profiles/${ben}/report`)).statusCode).toBe(403);
    expect((await get(admin.token, `/api/profiles/${ben}/report`)).statusCode).toBe(200);
    const stranger = await createUser();
    expect((await get(stranger.token, `/api/profiles/${ava}/report`)).statusCode).toBe(403);
    expect((await request(app, { method: 'GET', url: `/api/profiles/${ava}/report` })).statusCode).toBe(401);
    expect((await get(admin.token, `/api/profiles/${ava}/report?days=14`)).statusCode).toBe(400);
  });

  it('escapes CSV cells and neutralises formulas', async () => {
    const { admin, ava } = await setup();
    await db.insert(day_plans).values({ id: uuidv7(), profile_id: ava, client_updated_at: Date.now(), updated_by: admin.id, date: iso(0), note: 'Said "no", then\nyes; =SUM(A1)' });
    const res = await get(admin.token, `/api/profiles/${ava}/report?format=csv`);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toContain('date,tasks_done,tasks_planned,chips_earned,chips_spent');
    expect(res.body).toContain(`${iso(0)},Olga Owner,"Said ""no"", then\nyes; =SUM(A1)"`);
    const evil = await createUser('=cmd|calc');
    await addMember((await db.select().from(profiles).where(eq(profiles.id, ava)))[0]!.account_id, evil.id, 'member');
    await db.insert(profile_members).values({ profile_id: ava, user_id: evil.id, relationship_label: null });
    await db.insert(day_plans).values({ id: uuidv7(), profile_id: ava, client_updated_at: Date.now(), updated_by: evil.id, date: iso(1), note: 'x' });
    expect((await get(admin.token, `/api/profiles/${ava}/report?format=csv`)).body).toContain(`${iso(1)},'=cmd|calc,x`);
  });

  it('gives an org admin the account report with counts, groups, staff and a group filter', async () => {
    const { admin, staff, accountId, ava, ben, group } = await setup();
    await item(ava, staff.id, iso(0), true);
    await item(ava, staff.id, iso(1), true);
    await item(ben, admin.id, iso(1), true);
    await chip(ava, admin.id, 6, 0);
    await chip(ava, admin.id, -2, 0);

    const r = (await get(admin.token, `/api/accounts/${accountId}/report?days=7`)).json() as AccountReport;
    expect(r.people_total).toBe(2);
    expect(r.active_per_day.find((d) => d.date === iso(0))!.active_people).toBe(1);
    expect(r.active_per_day.find((d) => d.date === iso(1))!.active_people).toBe(2);
    const avaRow = r.people.find((p) => p.profile_id === ava)!;
    expect(avaRow).toMatchObject({ name: 'Ava', group: 'North, "clinic"', tasks_done: 2, chips_earned: 6 });
    expect(avaRow.last_active).not.toBeNull();
    expect(r.staff.find((s) => s.display_name === 'Sam Staff')!.completions).toBe(2);
    expect(r.staff.find((s) => s.display_name === 'Olga Owner')!.completions).toBe(1);
    expect(r.staff.some((s) => s.role === 'viewer')).toBe(false);

    const filtered = (await get(admin.token, `/api/accounts/${accountId}/report?cluster_id=${group}`)).json() as AccountReport;
    expect(filtered.people.map((p) => p.name)).toEqual(['Ava']);

    const csv = await get(admin.token, `/api/accounts/${accountId}/report?format=csv`);
    expect(csv.body).toContain('name,group,tasks_done,chips_earned,last_active');
    expect(csv.body).toContain('Ava,"North, ""clinic""",2,6,');
  });

  it('refuses the account report to staff, family and strangers, and works for a household admin', async () => {
    const { staff, parent, accountId } = await setup();
    expect((await get(staff.token, `/api/accounts/${accountId}/report`)).statusCode).toBe(403);
    expect((await get(parent.token, `/api/accounts/${accountId}/report`)).statusCode).toBe(403);
    const stranger = await createUser();
    expect((await get(stranger.token, `/api/accounts/${accountId}/report`)).statusCode).toBe(403);

    const mum = await createUser('Mum');
    const home = await createAccount(mum.id, 'household', 'Home');
    await addMember(home, mum.id, 'admin');
    const kid = await createProfile(home, mum.id, 'Kid');
    await item(kid, mum.id, iso(0), true);
    const r = (await get(mum.token, `/api/accounts/${home}/report`)).json() as AccountReport;
    expect(r.people).toMatchObject([{ name: 'Kid', tasks_done: 1, group: null }]);
    expect((await get(mum.token, `/api/accounts/${accountId}/report`)).statusCode).toBe(403);
  });

  it('gives a moderator the account report for their groups only', async () => {
    const { accountId, group } = await setup();
    const mod = await createUser('Mo Moderator');
    await addMember(accountId, mod.id, 'moderator');
    await db.insert(cluster_members).values({ user_id: mod.id, cluster_id: group, account_id: accountId, created_at: Date.now() });
    const r = (await get(mod.token, `/api/accounts/${accountId}/report`)).json() as AccountReport;
    expect(r.people.map((p) => p.name)).toEqual(['Ava']);
    const lone = await createUser('Lone Moderator');
    await addMember(accountId, lone.id, 'moderator');
    expect(((await get(lone.token, `/api/accounts/${accountId}/report`)).json() as AccountReport).people).toEqual([]);
  });
});
