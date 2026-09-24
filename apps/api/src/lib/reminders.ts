import { DEFAULT_REVIEW_REMINDER } from '@chipperly/shared/schemas/billing';
import { inArray } from 'drizzle-orm';
import { db, sql } from '../db/client.js';
import { push_tokens } from '../db/schema/push.js';
import { sendDataMessage, sendWebPush } from './push.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The hour (0-23) it is right now in this IANA zone; UTC when unknown. */
export function localHour(at: number, timeZone: string | null): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: timeZone ?? 'UTC', hour: 'numeric', hourCycle: 'h23' }).format(at));
  } catch {
    return new Date(at).getUTCHours();
  }
}

/**
 * Due: it's the chosen hour where they are, and it's been (almost) the
 * chosen number of days since the last one, or since they signed up. The
 * half-day slack lets "weekly at 7 pm" land on the same evening each week
 * even though the check runs every 10 minutes.
 */
export function reminderDue(
  at: number,
  setting: { every_days: number; hour: number; last_sent_at: number | null },
  userCreatedAt: number,
  timeZone: string | null,
): boolean {
  if (setting.every_days === 0) return false;
  if (localHour(at, timeZone) !== setting.hour) return false;
  return at - (setting.last_sent_at ?? userCreatedAt) >= (setting.every_days - 0.5) * DAY_MS;
}

/** Sends every due "check X's routines" reminder once. Called every 10 minutes by startReminders. */
export async function sendDueReminders(at = Date.now()): Promise<number> {
  // Every caregiver with somewhere to send to, and every child they can see (all of an admin's account, a member's own).
  const pairs = await sql<
    { user_id: string; created_at: string; time_zone: string | null; profile_id: string; name: string; every_days: number | null; hour: number | null; last_sent_at: string | null }[]
  >`
    with access as (
      select m.user_id, p.id as profile_id, p.name from account_members m
        join profiles p on p.account_id = m.account_id and p.deleted_at is null where m.role = 'admin'
      union
      select pm.user_id, p.id, p.name from profile_members pm join profiles p on p.id = pm.profile_id and p.deleted_at is null
    )
    select a.user_id, u.created_at, u.time_zone, a.profile_id, a.name, r.every_days, r.hour, r.last_sent_at
    from access a
    join users u on u.id = a.user_id
    left join review_reminders r on r.user_id = a.user_id and r.profile_id = a.profile_id
    where exists (select 1 from push_tokens t where t.user_id = a.user_id)`;

  const due = pairs.filter((p) =>
    reminderDue(
      at,
      {
        every_days: p.every_days ?? DEFAULT_REVIEW_REMINDER.every_days,
        hour: p.hour ?? DEFAULT_REVIEW_REMINDER.hour,
        last_sent_at: p.last_sent_at === null ? null : Number(p.last_sent_at),
      },
      Number(p.created_at),
      p.time_zone,
    ),
  );
  if (due.length === 0) return 0;

  const tokens = await sql<{ user_id: string; token: string; platform: string }[]>`
    select t.user_id, t.token, t.platform from push_tokens t
    left join devices d on d.id = t.device_id
    where t.user_id in ${sql(due.map((d) => d.user_id))} and d.profile_id is null`;

  for (const p of due) {
    const mine = tokens.filter((t) => t.user_id === p.user_id);
    const data = {
      type: 'review_reminder',
      profile_id: p.profile_id,
      title: `Check ${p.name}'s routines`,
      body: `Anything to change for ${p.name}? A quick look keeps the day right.`,
      path: `settings/library/routines/?profile=${p.profile_id}`,
    };
    const [, stale] = await Promise.all([
      sendDataMessage({ tokens: mine.filter((t) => t.platform !== 'web').map((t) => t.token), data }),
      sendWebPush(mine.filter((t) => t.platform === 'web').map((t) => t.token), data),
    ]);
    if (stale.length > 0) await db.delete(push_tokens).where(inArray(push_tokens.token, stale));
    await sql`
      insert into review_reminders (user_id, profile_id, every_days, hour, last_sent_at)
      values (${p.user_id}, ${p.profile_id}, ${p.every_days ?? DEFAULT_REVIEW_REMINDER.every_days}, ${p.hour ?? DEFAULT_REVIEW_REMINDER.hour}, ${at})
      on conflict (user_id, profile_id) do update set last_sent_at = ${at}`;
  }
  return due.length;
}

/** ponytail: an in-process timer; move to a job queue if the API ever runs as more than one process. */
export function startReminders(log: (err: unknown) => void): () => void {
  const handle = setInterval(() => void sendDueReminders().catch(log), 10 * 60 * 1000);
  return () => clearInterval(handle);
}
