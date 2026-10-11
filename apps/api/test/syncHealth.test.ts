import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { MUTATION_TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { materializedId } from '@chipperly/shared/helpers/recurrence';
import { SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import { AdminSyncHealthSchema } from '@chipperly/shared/schemas/syncHealth';
import { sql } from '../src/db/client.js';
import { env } from '../src/env.js';
import { getLastMailMessage } from '../src/lib/mailer.js';
import { alertNewRejections, digestLines, findOrphans, resetAlertThrottle, sendSyncHealthDigest } from '../src/lib/syncHealth.js';
import { buildTestApp, expectShape, request } from './helpers.js';
import { createUser, setupProfile, type TestUser } from './fixtures.js';

interface MutationInput {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  row?: Record<string, unknown>;
  client_updated_at: number;
}

const DATE = '2026-10-10';

function base(id: string, profileId: string, userId: string, at: number): Record<string, unknown> {
  return { id, profile_id: profileId, version: 0, client_updated_at: at, updated_by: userId, deleted_at: null };
}

function activity(id: string, profileId: string, userId: string, at: number, overrides: Record<string, unknown> = {}): MutationInput {
  return {
    table: 'activities',
    id,
    op: 'upsert',
    client_updated_at: at,
    row: {
      ...base(id, profileId, userId, at),
      name: 'Bedtime Routine',
      emoji: null,
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: 'daily',
      recurrence_weekdays: null,
      recurrence_time: '20:00',
      position: 0,
      ...overrides,
    },
  };
}

function item(id: string, profileId: string, activityId: string, userId: string, at: number, overrides: Record<string, unknown> = {}): MutationInput {
  return {
    table: 'schedule_items',
    id,
    op: 'upsert',
    client_updated_at: at,
    row: {
      ...base(id, profileId, userId, at),
      date: DATE,
      position: 0,
      activity_id: activityId,
      start_time: '20:00',
      part_of_day: 'evening',
      source: 'recurring',
      completed_at: null,
      completed_by: null,
      ...overrides,
    },
  };
}

function stepCompletion(id: string, profileId: string, itemId: string, userId: string, at: number): MutationInput {
  return {
    table: 'step_completions',
    id,
    op: 'upsert',
    client_updated_at: at,
    row: { ...base(id, profileId, userId, at), schedule_item_id: itemId, activity_step_id: uuidv7(), completed_at: at, completed_by: userId },
  };
}

describe('nothing a device writes vanishes without a trace', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    resetAlertThrottle();
  });

  const auth = (user: TestUser) => ({ authorization: `Bearer ${user.token}` });

  function push(user: TestUser, profileId: string, mutations: MutationInput[], deviceId?: string): Promise<LightMyRequestResponse> {
    return request(app, { method: 'POST', url: '/api/sync/push', headers: auth(user), payload: { profile_id: profileId, mutations, device_id: deviceId } });
  }

  async function lock(user: TestUser, profileId: string): Promise<void> {
    const res = await request(app, { method: 'POST', url: '/api/me/lock', headers: auth(user), payload: { profile_id: profileId } });
    expect(res.statusCode).toBe(200);
  }

  async function unlockAll(userId: string): Promise<void> {
    await sql`update sessions set locked_profile_id = null where user_id = ${userId}`;
  }

  const rejectionsFor = (rowId: string) =>
    sql<{ reason: string; seen_count: number; resolved_at: string | null; resolution: string | null; payload: unknown; locked: boolean; source: string; device_id: string | null }[]>`
      select reason, seen_count, resolved_at, resolution, payload, locked, source, device_id from sync_rejections where row_id = ${rowId}`;

  async function superAdmin(): Promise<TestUser> {
    const boss = await createUser('Boss');
    const [{ email }] = await sql<{ email: string }[]>`select email from users where id = ${boss.id}`;
    env.superAdminEmails.add(email);
    return boss;
  }

  describe('a phone left in the child view overnight', () => {
    it('saves the new day it builds while locked, and the ticks made on it', async () => {
      const { admin, profileId } = await setupProfile();
      const activityId = uuidv7();
      const t0 = Date.now();
      await push(admin, profileId, [activity(activityId, profileId, admin.id, t0)]);
      await lock(admin, profileId);

      const itemId = materializedId(activityId, DATE);
      const tickId = uuidv7();
      const res = await push(admin, profileId, [
        item(itemId, profileId, activityId, admin.id, t0 + 1),
        stepCompletion(tickId, profileId, itemId, admin.id, t0 + 2),
      ]);
      const body = expectShape(res, SyncPushResponseSchema);
      expect(body.rejected).toEqual([]);
      expect(body.applied).toEqual([itemId, tickId]);

      const [stored] = await sql`select source, date from schedule_items where id = ${itemId}`;
      expect(stored).toMatchObject({ source: 'recurring', date: DATE });
      expect((await findOrphans()).filter((o) => o.profile_id === profileId)).toEqual([]);
    });

    it('still refuses anything else new: a made-up id, a manual item, a routine that does not repeat', async () => {
      const { admin, profileId } = await setupProfile();
      const repeating = uuidv7();
      const oneOff = uuidv7();
      const t0 = Date.now();
      await push(admin, profileId, [
        activity(repeating, profileId, admin.id, t0),
        activity(oneOff, profileId, admin.id, t0, { recurrence: null, recurrence_time: null }),
      ]);
      await lock(admin, profileId);

      const madeUp = uuidv7();
      const manual = materializedId(repeating, '2026-10-11');
      const notRepeating = materializedId(oneOff, DATE);
      const res = await push(admin, profileId, [
        item(madeUp, profileId, repeating, admin.id, t0 + 1),
        item(manual, profileId, repeating, admin.id, t0 + 1, { date: '2026-10-11', source: 'manual' }),
        item(notRepeating, profileId, oneOff, admin.id, t0 + 1),
      ]);
      const body = expectShape(res, SyncPushResponseSchema);
      expect(body.applied).toEqual([]);
      expect(body.rejected.map((r) => [r.id, r.reason])).toEqual([
        [madeUp, 'locked'],
        [manual, 'locked'],
        [notRepeating, 'locked'],
      ]);
    });
  });

  describe('a refused write', () => {
    it('is kept with its row, counted once however often it is retried, and closed when it is later accepted', async () => {
      const { admin, profileId } = await setupProfile();
      await lock(admin, profileId);
      const activityId = uuidv7();
      const deviceId = uuidv7();
      const t0 = Date.now();
      const mutation = activity(activityId, profileId, admin.id, t0, { name: 'Made while locked' });

      const first = expectShape(await push(admin, profileId, [mutation], deviceId), SyncPushResponseSchema);
      expect(first.rejected).toMatchObject([{ id: activityId, reason: 'locked' }]);
      await push(admin, profileId, [mutation], deviceId);

      const kept = await rejectionsFor(activityId);
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({ reason: 'locked', seen_count: 2, resolved_at: null, locked: true, source: 'server', device_id: deviceId });
      expect(kept[0]!.payload).toMatchObject({ name: 'Made while locked' });

      await unlockAll(admin.id);
      const later = expectShape(await push(admin, profileId, [mutation], deviceId), SyncPushResponseSchema);
      expect(later.applied).toEqual([activityId]);
      const [closed] = await rejectionsFor(activityId);
      expect(closed!.resolved_at).not.toBeNull();
      expect(closed!.resolution).toBe('accepted_later');
    });

    it('is not recorded when the server simply had something newer', async () => {
      const { admin, profileId } = await setupProfile();
      const activityId = uuidv7();
      const t0 = Date.now();
      await push(admin, profileId, [activity(activityId, profileId, admin.id, t0)]);
      const res = expectShape(await push(admin, profileId, [activity(activityId, profileId, admin.id, t0 - 1000)]), SyncPushResponseSchema);
      expect(res.rejected).toMatchObject([{ id: activityId, reason: 'stale' }]);
      expect(await rejectionsFor(activityId)).toEqual([]);
    });

    it.each([false, true])('in every table is either saved or recorded (locked: %s)', async (locked) => {
      const { admin, profileId } = await setupProfile();
      if (locked) await lock(admin, profileId);
      const t0 = Date.now();
      // Deliberately thin rows: whatever each table's gate and schema make of them, none may disappear.
      const mutations: MutationInput[] = MUTATION_TABLE_NAMES.flatMap((table) => {
        const upsertId = table === 'profiles' ? profileId : uuidv7();
        const rows: MutationInput[] = [{ table, id: upsertId, op: 'upsert', row: { ...base(upsertId, profileId, admin.id, t0), nonsense: true }, client_updated_at: t0 }];
        if (table !== 'profiles') rows.push({ table, id: uuidv7(), op: 'delete', client_updated_at: t0 });
        return rows;
      });

      const body = expectShape(await push(admin, profileId, mutations), SyncPushResponseSchema);
      expect([...body.applied, ...body.rejected.map((r) => r.id)].sort()).toEqual(mutations.map((m) => m.id).sort());
      for (const refused of body.rejected) {
        if (refused.reason === 'stale') continue;
        const kept = await sql`select 1 from sync_rejections where row_id = ${refused.id} and reason = ${refused.reason} and table_name = ${refused.table}`;
        expect(kept, `${refused.table} ${refused.reason} was not recorded`).toHaveLength(1);
      }
      expect(body.rejected.length).toBeGreaterThan(0);
    });
  });

  describe('what a device reports', () => {
    it('stores writes it could not send at all, and its own count of unsent writes', async () => {
      const { admin, profileId } = await setupProfile();
      const deviceId = uuidv7();
      await sql`insert into devices (id, user_id, platform, last_seen_at, created_at) values (${deviceId}, ${admin.id}, 'web', ${Date.now()}, ${Date.now()})`;
      const rowId = uuidv7();

      const report = await request(app, {
        method: 'POST',
        url: '/api/sync/rejections',
        headers: auth(admin),
        payload: {
          device_id: deviceId,
          items: [{ table: 'activities', id: rowId, op: 'upsert', reason: 'http_400:profile_mismatch', client_updated_at: Date.now(), profile_id: profileId, row: { name: 'Stuck' } }],
        },
      });
      expect(report.statusCode).toBe(200);
      expect(await rejectionsFor(rowId)).toMatchObject([{ reason: 'http_400:profile_mismatch', source: 'client', payload: { name: 'Stuck' } }]);

      const oldest = Date.now() - 7 * 60 * 60 * 1000;
      const health = await request(app, {
        method: 'PUT',
        url: '/api/me/sync-health',
        headers: auth(admin),
        payload: { device_id: deviceId, pending: 3, oldest_at: oldest, held: 1, dead: 0 },
      });
      expect(health.statusCode).toBe(200);

      const boss = await superAdmin();
      const seen = expectShape(await request(app, { method: 'GET', url: '/api/admin/sync-health', headers: auth(boss) }), AdminSyncHealthSchema);
      expect(seen.attention).toBe(true);
      expect(seen.devices.find((d) => d.id === deviceId)).toMatchObject({ pending: 3, held: 1, dead: 0, oldest_at: oldest });
      expect(seen.rejections.find((r) => r.row_id === rowId)).toMatchObject({ source: 'client', has_payload: true, profile_id: profileId });

      const refusedToOthers = await request(app, { method: 'GET', url: '/api/admin/sync-health', headers: auth(admin) });
      expect(refusedToOthers.statusCode).toBe(403);
    });

    it("cannot be used to change another person's device", async () => {
      const { admin } = await setupProfile();
      const stranger = await createUser();
      const deviceId = uuidv7();
      await sql`insert into devices (id, user_id, platform, last_seen_at, created_at) values (${deviceId}, ${admin.id}, 'web', ${Date.now()}, ${Date.now()})`;
      await request(app, { method: 'PUT', url: '/api/me/sync-health', headers: auth(stranger), payload: { device_id: deviceId, pending: 9, oldest_at: null, held: 0, dead: 0 } });
      const [device] = await sql`select sync_pending from devices where id = ${deviceId}`;
      expect(device!.sync_pending).toBeNull();
    });
  });

  describe('a super admin', () => {
    it('can put a refused write back, and close one without applying it', async () => {
      const { admin, profileId } = await setupProfile();
      await lock(admin, profileId);
      const wanted = uuidv7();
      const unwanted = uuidv7();
      const t0 = Date.now();
      await push(admin, profileId, [
        activity(wanted, profileId, admin.id, t0, { name: 'Put me back' }),
        activity(unwanted, profileId, admin.id, t0, { name: 'Leave me' }),
      ]);
      const boss = await superAdmin();
      const idOf = async (rowId: string): Promise<string> => (await sql<{ id: string }[]>`select id from sync_rejections where row_id = ${rowId}`)[0]!.id;

      const shown = await request(app, { method: 'GET', url: `/api/admin/sync-rejections/${await idOf(wanted)}`, headers: auth(boss) });
      expect(shown.json().payload).toMatchObject({ name: 'Put me back' });

      const replay = await request(app, { method: 'POST', url: `/api/admin/sync-rejections/${await idOf(wanted)}/replay`, headers: auth(boss) });
      expect(replay.json()).toEqual({ ok: true, result: 'replayed' });
      const [restored] = await sql`select name, updated_by from activities where id = ${wanted}`;
      expect(restored).toMatchObject({ name: 'Put me back', updated_by: admin.id });
      expect((await rejectionsFor(wanted))[0]!.resolution).toBe('replayed');

      const again = await request(app, { method: 'POST', url: `/api/admin/sync-rejections/${await idOf(wanted)}/replay`, headers: auth(boss) });
      expect(again.statusCode).toBe(409);

      await request(app, { method: 'POST', url: `/api/admin/sync-rejections/${await idOf(unwanted)}/dismiss`, headers: auth(boss) });
      expect((await rejectionsFor(unwanted))[0]!.resolution).toBe('dismissed');
      expect(await sql`select 1 from activities where id = ${unwanted}`).toHaveLength(0);

      const refused = await request(app, { method: 'POST', url: `/api/admin/sync-rejections/${await idOf(unwanted)}/replay`, headers: auth(admin) });
      expect(refused.statusCode).toBe(403);
    });
  });

  // The test files share one database and run side by side, so these look
  // only at their own rows, never at totals.
  describe('the mails', () => {
    it('go out at once for a refusal that will not clear by itself, and not for one that will', async () => {
      const boss = await superAdmin();
      const [{ email }] = await sql<{ email: string }[]>`select email from users where id = ${boss.id}`;
      env.superAdminEmails.clear();
      env.superAdminEmails.add(email);
      const alerted = async (rowId: string): Promise<boolean> =>
        (await sql`select 1 from sync_rejections where row_id = ${rowId} and alerted_at is not null`).length === 1;

      const { admin, profileId } = await setupProfile();
      await lock(admin, profileId);
      const held = uuidv7();
      await push(admin, profileId, [activity(held, profileId, admin.id, Date.now())]);
      await alertNewRejections();
      expect(await alerted(held)).toBe(false);

      resetAlertThrottle();
      await unlockAll(admin.id);
      const broken = uuidv7();
      await push(admin, profileId, [{ table: 'activities', id: broken, op: 'upsert', row: { nonsense: true }, client_updated_at: Date.now() }]);
      // The push fires the mail itself, without waiting for it.
      await expect.poll(() => alerted(broken)).toBe(true);
      await expect.poll(() => getLastMailMessage()?.subject).toBe('Chipperly: changes could not be saved');
      const mail = getLastMailMessage()!;
      expect(mail.to).toBe(email);
      expect(mail.text).toMatch(/\d+ x activities: invalid/);
      expect(mail.text).not.toContain('nonsense');
    });

    it('once a day list what is still open', async () => {
      // A tick whose schedule item never arrived: what Benny's phone left behind.
      const { admin, profileId } = await setupProfile();
      await push(admin, profileId, [stepCompletion(uuidv7(), profileId, uuidv7(), admin.id, Date.now())]);
      expect((await findOrphans()).filter((o) => o.profile_id === profileId)).toMatchObject([{ kind: 'Ticked steps with no schedule item', count: 1 }]);

      const afternoon = Date.UTC(2031, 0, 5, 14);
      await sql`delete from sync_health_digests where day = '2031-01-05'`;
      expect(await sendSyncHealthDigest(Date.UTC(2031, 0, 5, 9))).toBe(false);
      expect(await sendSyncHealthDigest(afternoon)).toBe(true);
      expect(getLastMailMessage()).toMatchObject({ subject: 'Chipperly: sync needs a look' });
      expect(getLastMailMessage()!.text).toMatch(/\d+ rows? for \d+ (person|people) point at something the server never received/);
      expect(await sendSyncHealthDigest(afternoon + 60_000)).toBe(false);
    });

    it('say nothing when nothing is open', () => {
      expect(digestLines({ rejections: 0, devices: 0, orphan_rows: 0, orphan_people: 0 })).toEqual([]);
      expect(digestLines({ rejections: 1, devices: 2, orphan_rows: 3, orphan_people: 1 })).toEqual([
        '1 refused change is still not saved.',
        '2 devices are holding changes that have not reached the server.',
        '3 rows for 1 person point at something the server never received.',
      ]);
    });
  });
});
