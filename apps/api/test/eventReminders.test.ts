import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { push_tokens } from '../src/db/schema/push.js';
import { env } from '../src/env.js';
import { setupProfile, type TestProfileSetup } from './fixtures.js';

const sendDataMessage = vi.hoisted(() => vi.fn(async (_m: { tokens: readonly string[]; data: Record<string, string> }) => true));
const sendWebPush = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));
vi.mock('../src/lib/push.js', () => ({ sendDataMessage, sendWebPush }));

const { sendDueEventReminders } = await import('../src/lib/reminders.js');

/** 2026-10-02 at the given UTC hour. The event below is on 2026-10-05, so 3 days out. */
const at = (hour: number, day = 2, year = 2026): number => Date.UTC(year, 9, day, hour, 0);

let setup: TestProfileSetup;

interface EventOptions {
  date?: string;
  recurrence?: string | null;
  days?: number;
  hour?: number;
  dismissed?: string[];
  deleted?: boolean;
}

async function addEvent(o: EventOptions = {}): Promise<{ id: string; title: string }> {
  const id = uuidv7();
  const title = `Test event ${id}`;
  await sql`
    insert into day_events (id, profile_id, client_updated_at, updated_by, deleted_at, title, date, recurrence, remind_days_before, remind_hour, reminder_dismissed)
    values (${id}, ${setup.profileId}, ${Date.now()}, ${setup.admin.id}, ${o.deleted ? Date.now() : null}, ${title}, ${o.date ?? '2026-10-05'},
            ${o.recurrence ?? null}, ${o.days ?? 3}, ${o.hour ?? 8}, ${`{${(o.dismissed ?? []).join(',')}}`}::text[])`;
  return { id, title };
}

/** Pushes that named this event (the shared test database may hold other events). */
function pushesFor(title: string): number {
  return sendDataMessage.mock.calls.filter(([m]) => m.data.title === title).length;
}

beforeAll(async () => {
  setup = await setupProfile();
  await db.update(users).set({ time_zone: 'UTC' }).where(eq(users.id, setup.admin.id));
  await db.insert(push_tokens).values({ user_id: setup.admin.id, token: `tok-${setup.admin.id}`, platform: 'android', created_at: Date.now() });
});

beforeEach(() => {
  sendDataMessage.mockClear();
  env.pushEnabled = true;
});

afterEach(() => {
  env.pushEnabled = false;
});

describe('sendDueEventReminders', () => {
  it('sends at the reminder hour in the caregiver time zone and not at other hours', async () => {
    const { title } = await addEvent();
    await sendDueEventReminders(at(7));
    await sendDueEventReminders(at(9));
    expect(pushesFor(title)).toBe(0);

    await sendDueEventReminders(at(8));
    expect(pushesFor(title)).toBe(1);
    const call = sendDataMessage.mock.calls.find(([m]) => m.data.title === title);
    expect(call?.[0].data.body).toBe(`${title} is in 3 days.`);
    expect(call?.[0].data.path).toBe('today/');
  });

  it('follows users.time_zone: 8 am in Sydney is not 8 am UTC', async () => {
    await db.update(users).set({ time_zone: 'Australia/Sydney' }).where(eq(users.id, setup.admin.id));
    try {
      const { title } = await addEvent();
      await sendDueEventReminders(at(8));
      expect(pushesFor(title)).toBe(0);
      // 22:00 UTC on 1 Oct is 08:00 on 2 Oct in Sydney. Still UTC+10 here: Sydney's
      // summer time does not begin until the first Sunday in October, the 4th in 2026.
      await sendDueEventReminders(Date.UTC(2026, 9, 1, 22, 0));
      expect(pushesFor(title)).toBe(1);
    } finally {
      await db.update(users).set({ time_zone: 'UTC' }).where(eq(users.id, setup.admin.id));
    }
  });

  it('does not send twice for the same date, but sends again the next day', async () => {
    const { title } = await addEvent();
    await sendDueEventReminders(at(8));
    await sendDueEventReminders(at(8) + 10 * 60 * 1000);
    await Promise.all([sendDueEventReminders(at(8)), sendDueEventReminders(at(8))]);
    expect(pushesFor(title)).toBe(1);

    await sendDueEventReminders(at(8, 3));
    expect(pushesFor(title)).toBe(2);
    expect(sendDataMessage.mock.calls.at(-1)?.[0].data.body).toContain('is in 2 days.');
  });

  it('does not push a date whose reminder was dismissed in the app', async () => {
    const { title } = await addEvent({ dismissed: ['2026-10-02'] });
    await sendDueEventReminders(at(8));
    expect(pushesFor(title)).toBe(0);
    await sendDueEventReminders(at(8, 3));
    expect(pushesFor(title)).toBe(1);
  });

  it('never reminds for a deleted event', async () => {
    const { title } = await addEvent({ deleted: true });
    await sendDueEventReminders(at(8));
    expect(pushesFor(title)).toBe(0);
  });

  it('reminds a yearly event again the following year', async () => {
    const { title } = await addEvent({ date: '2025-10-05', recurrence: 'yearly' });
    await sendDueEventReminders(at(8));
    expect(pushesFor(title)).toBe(1);
    await sendDueEventReminders(at(8, 2, 2027));
    expect(pushesFor(title)).toBe(2);
  });

  it('is a quiet no-op when push is unconfigured', async () => {
    env.pushEnabled = false;
    env.webPushEnabled = false;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { id, title } = await addEvent();
    await expect(sendDueEventReminders(at(8))).resolves.toBe(0);
    expect(pushesFor(title)).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();

    // Nothing was marked as sent, so it goes out once push is configured.
    const marks = await sql`select 1 from event_reminder_sent where event_id = ${id}`;
    expect(marks.length).toBe(0);
  });
});
