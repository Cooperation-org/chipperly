import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { account_members, accounts, promo_codes, review_reminders, users } from '../src/db/schema/accounts.js';
import { profiles } from '../src/db/schema/profiles.js';
import { push_tokens } from '../src/db/schema/push.js';
import { issueTokens } from '../src/lib/tokens.js';
import { env } from '../src/env.js';
import { localHour, reminderDue, sendDueReminders } from '../src/lib/reminders.js';

const DAY = 24 * 60 * 60 * 1000;

async function createUser(label: string, createdAt = Date.now()): Promise<{ id: string; token: string; email: string }> {
  const id = uuidv7();
  const email = `${label}-${id}@example.com`;
  await db.insert(users).values({ id, email, display_name: label, created_at: createdAt });
  return { id, email, token: (await issueTokens(id)).access_token };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createChild(ownerId: string, name: string, at = Date.now()): Promise<string> {
  const accountId = uuidv7();
  await db.insert(accounts).values({ id: accountId, kind: 'household', name, created_at: at, owner_user_id: ownerId });
  await db.insert(account_members).values({ account_id: accountId, user_id: ownerId, role: 'admin' });
  const profileId = uuidv7();
  await db.insert(profiles).values({
    id: profileId,
    account_id: accountId,
    name,
    avatar_emoji: null,
    avatar_photo_id: null,
    share_token: null,
    first_then_activity_id: null,
    first_then_reward_id: null,
    settings: {},
    client_updated_at: at,
    updated_by: ownerId,
    deleted_at: null,
  });
  return profileId;
}

describe('trial, early access codes, routine reminders, super admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('a new person has 21 days of trial and is not a super admin', async () => {
    const u = await createUser('trial');
    const me = (await request(app, { method: 'GET', url: '/api/me', headers: auth(u.token) })).json() as {
      user: { trial_ends_at: number; created_at: number; is_super_admin: boolean; promo: unknown };
    };
    expect(me.user.trial_ends_at - me.user.created_at).toBe(21 * DAY);
    expect(me.user.is_super_admin).toBe(false);
    expect(me.user.promo).toBeNull();
  });

  it('claims a live code, refuses an ended or unknown one', async () => {
    const u = await createUser('promo');
    const now = Date.now();
    await db.insert(promo_codes).values([
      { code: 'TESTLIVE', percent_off: 30, valid_from: now - DAY, valid_until: now + DAY, created_at: now },
      { code: 'TESTOLD', percent_off: 30, valid_from: now - 9 * DAY, valid_until: now - DAY, created_at: now },
    ]);
    const claim = (code: string) => request(app, { method: 'POST', url: '/api/me/promo-code', headers: auth(u.token), payload: { code } });
    expect((await claim('testold')).statusCode).toBe(404);
    expect((await claim('NOPE')).statusCode).toBe(404);
    expect((await claim('testlive')).statusCode).toBe(200);
    const me = (await request(app, { method: 'GET', url: '/api/me', headers: auth(u.token) })).json() as { user: { promo: unknown } };
    expect(me.user.promo).toEqual({ code: 'TESTLIVE', percent_off: 30 });
  });

  it('the conference code EARLYCHIPPER runs from 24 Sept to the end of 24 Oct 2026', async () => {
    const [code] = await db.select().from(promo_codes).where(eq(promo_codes.code, 'EARLYCHIPPER'));
    expect(new Date(code!.valid_from).toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(new Date(code!.valid_until).toISOString()).toBe('2026-10-24T23:59:59.000Z');
  });

  it('admin routes: refused to everyone but SUPER_ADMIN_EMAILS; can extend a trial and add a code', async () => {
    const boss = await createUser('boss');
    const someone = await createUser('someone');
    expect((await request(app, { method: 'GET', url: '/api/admin/overview', headers: auth(boss.token) })).statusCode).toBe(403);

    env.superAdminEmails.add(boss.email);
    const overview = await request(app, { method: 'GET', url: '/api/admin/overview', headers: auth(boss.token) });
    expect(overview.statusCode).toBe(200);
    expect((overview.json() as { signups_by_day: unknown[] }).signups_by_day).toHaveLength(30);

    const list = (
      await request(app, { method: 'GET', url: `/api/admin/users?q=${encodeURIComponent(someone.email)}`, headers: auth(boss.token) })
    ).json() as { users: { id: string }[] };
    expect(list.users.map((u) => u.id)).toEqual([someone.id]);

    const ext = await request(app, {
      method: 'POST',
      url: `/api/admin/users/${someone.id}/extend-trial`,
      headers: auth(boss.token),
      payload: { days: 10 },
    });
    expect((ext.json() as { trial_ends_at: number }).trial_ends_at).toBeGreaterThan(Date.now() + 30 * DAY);

    const put = await request(app, {
      method: 'PUT',
      url: '/api/admin/promo-codes',
      headers: auth(boss.token),
      payload: { code: 'springsale', percent_off: 15, applies_to: 'annual', valid_from: Date.now(), valid_until: Date.now() + DAY, active: true, note: null },
    });
    expect(put.statusCode).toBe(200);
    const codes = (await request(app, { method: 'GET', url: '/api/admin/promo-codes', headers: auth(boss.token) })).json() as {
      codes: { code: string }[];
    };
    expect(codes.codes.map((c) => c.code)).toContain('SPRINGSALE');
    env.superAdminEmails.delete(boss.email);
  });

  it('reminderDue: at the chosen local hour, once the days have passed', () => {
    const at = Date.UTC(2026, 8, 27, 17, 5);
    const hour = localHour(at, 'Africa/Cairo');
    const setting = { every_days: 7, hour, last_sent_at: at - 7 * DAY + 60_000 };
    expect(reminderDue(at, setting, 0, 'Africa/Cairo')).toBe(true);
    expect(reminderDue(at, { ...setting, last_sent_at: at - 2 * DAY }, 0, 'Africa/Cairo')).toBe(false);
    expect(reminderDue(at, { ...setting, hour: (hour + 1) % 24 }, 0, 'Africa/Cairo')).toBe(false);
    expect(reminderDue(at, { ...setting, every_days: 0 }, 0, 'Africa/Cairo')).toBe(false);
  });

  it('sends a due reminder once to a caregiver with a device, and remembers it', async () => {
    const at = Date.UTC(2026, 9, 4, 19, 0);
    const parent = await createUser('remind', at - 30 * DAY);
    await db.update(users).set({ time_zone: 'UTC' }).where(eq(users.id, parent.id));
    await createChild(parent.id, 'Mia', at);
    await db.insert(push_tokens).values({ user_id: parent.id, token: `remind-${parent.id}`, platform: 'android', created_at: at });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendDueReminders(at);
    expect(logSpy.mock.calls.join(' ')).toContain('Check Mia');
    logSpy.mockClear();
    await sendDueReminders(at + 20 * 60_000);
    expect(logSpy.mock.calls.join(' ')).not.toContain('Check Mia');
    logSpy.mockRestore();

    const [row] = await db.select().from(review_reminders).where(eq(review_reminders.user_id, parent.id));
    expect(row?.last_sent_at).toBe(at);
  });

  it('a caregiver sets how often, per child', async () => {
    const u = await createUser('setter');
    const profileId = await createChild(u.id, 'Ari');
    const url = `/api/profiles/${profileId}/review-reminder`;
    expect((await request(app, { method: 'GET', url, headers: auth(u.token) })).json()).toEqual({ every_days: 7, hour: 19 });
    await request(app, { method: 'PUT', url, headers: auth(u.token), payload: { every_days: 3, hour: 8 } });
    expect((await request(app, { method: 'GET', url, headers: auth(u.token) })).json()).toEqual({ every_days: 3, hour: 8 });
  });
});
