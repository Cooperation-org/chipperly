import { v7 as uuidv7 } from 'uuid';
import type { AdminSyncDevice, AdminSyncHealth, AdminSyncOrphan, AdminSyncRejection } from '@chipperly/shared/schemas/syncHealth';
import { sql } from '../db/client.js';
import { env } from '../env.js';
import { adminOrigin, renderEmail } from './emailTemplate.js';
import { sendMail } from './mailer.js';

// Nothing a device writes may vanish without a trace. Three records make
// that checkable from the server:
//
//  - sync_rejections: every write /sync/push refused (with the row itself,
//    so it can be put back by hand), and every write a device reports it
//    could not send at all. Closed automatically when the same row is later
//    accepted.
//  - devices.sync_*: each device's own count of unsent writes, reported
//    after every sync cycle.
//  - the orphan check below: rows that point at a row the server never got.
//
// A refusal that will not fix itself is mailed at once; everything still
// open is mailed once a day (sendSyncHealthDigest).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Refusals that clear by themselves: the device sends the write again after an unlock or a subscription. */
const HELD_REASONS = new Set(['locked', 'lapsed']);

export function isHeldReason(reason: string): boolean {
  return HELD_REASONS.has(reason);
}

/** A saved row bigger than this is not kept: one runaway payload must not fill the table. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

export interface RejectionInput {
  user_id: string;
  session_id: string | null;
  device_id: string | null;
  profile_id: string | null;
  table: string;
  row_id: string;
  op: string;
  reason: string;
  source: 'server' | 'client';
  locked: boolean;
  client_updated_at: number;
  row: Record<string, unknown> | null;
}

/**
 * Saves refused writes. The same write refused again (a device retrying
 * while still locked) bumps the existing row instead of adding one. Returns
 * how many were new and will not clear by themselves, which is what
 * deserves an immediate mail.
 */
export async function recordRejections(inputs: readonly RejectionInput[], now = Date.now()): Promise<number> {
  let fresh = 0;
  for (const input of inputs) {
    const json = input.row ? JSON.stringify(input.row) : null;
    const payload = json !== null && Buffer.byteLength(json) <= MAX_PAYLOAD_BYTES ? json : null;
    // eslint-disable-next-line no-await-in-loop -- a handful of rows, and each needs its own conflict result.
    const rows = await sql<{ inserted: boolean }[]>`
      insert into sync_rejections
        (id, created_at, last_seen_at, user_id, session_id, device_id, profile_id, table_name, row_id, op, reason, source, locked, client_updated_at, payload)
      values
        (${uuidv7()}, ${now}, ${now}, ${input.user_id}, ${input.session_id}, ${input.device_id}, ${input.profile_id}, ${input.table},
         ${input.row_id}, ${input.op}, ${input.reason}, ${input.source}, ${input.locked}, ${input.client_updated_at}, ${payload}::jsonb)
      on conflict (row_id, client_updated_at, reason, source)
      do update set last_seen_at = ${now}, seen_count = sync_rejections.seen_count + 1
      returning (xmax = 0) as inserted
    `;
    if (rows[0]?.inserted && !isHeldReason(input.reason)) fresh += 1;
  }
  return fresh;
}

/** A row that was refused earlier and has now been accepted is no longer a problem. */
export async function resolveRejectionsFor(rowIds: readonly string[], now = Date.now()): Promise<void> {
  if (rowIds.length === 0) return;
  await sql`
    update sync_rejections set resolved_at = ${now}, resolution = 'accepted_later'
    where resolved_at is null and row_id = any(${rowIds as string[]})
  `;
}

/** Where the mails go: SYNC_ALERT_EMAIL_TO, else the super admins. Empty means nobody is told by mail. */
export function alertRecipients(): string[] {
  const explicit = (env.SYNC_ALERT_EMAIL_TO ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  return explicit.length > 0 ? explicit : [...env.superAdminEmails];
}

const adminUrl = (): string => `${adminOrigin()}/admin/sync/`;

let lastAlertAt = 0;
/** At most one "refused just now" mail in this long; the rest wait for the next one or the daily mail. */
const ALERT_GAP_MS = 30 * 60 * 1000;

/** Test hook. */
export function resetAlertThrottle(): void {
  lastAlertAt = 0;
}

/**
 * Mails every refusal nobody has been told about yet (and that will not
 * clear by itself). No names and no content of the write go in the mail:
 * the admin screen shows those to someone signed in.
 */
export async function alertNewRejections(now = Date.now()): Promise<number> {
  if (now - lastAlertAt < ALERT_GAP_MS) return 0;
  const rows = await sql<{ id: string; table_name: string; reason: string }[]>`
    select id, table_name, reason from sync_rejections
    where alerted_at is null and resolved_at is null and reason not in ('locked', 'lapsed')
    order by created_at limit 500
  `;
  if (rows.length === 0) return 0;
  lastAlertAt = now;
  await sql`update sync_rejections set alerted_at = ${now} where id = any(${rows.map((r) => r.id)})`;

  const byKind = new Map<string, number>();
  for (const r of rows) byKind.set(`${r.table_name}: ${r.reason}`, (byKind.get(`${r.table_name}: ${r.reason}`) ?? 0) + 1);
  const mail = renderEmail({
    heading: `${rows.length} change${rows.length === 1 ? '' : 's'} from a device could not be saved`,
    paragraphs: [
      'The server refused these and they will not go through by themselves. Each one is kept, so nothing is lost yet, but someone has to look.',
      [...byKind].map(([kind, count]) => `${count} x ${kind}`).join('\n'),
    ],
    action: { label: 'Open sync health', url: adminUrl() },
  });
  for (const to of alertRecipients()) await sendMail({ to, subject: 'Chipperly: changes could not be saved', ...mail });
  return rows.length;
}

/** Rows that point at a row the server does not have, counted per person. */
export async function findOrphans(): Promise<AdminSyncOrphan[]> {
  return sql<AdminSyncOrphan[]>`
    with found as (
      select c.profile_id, 'Ticked steps with no schedule item' as kind, count(*)::int as count
      from step_completions c
      where c.deleted_at is null and not exists (select 1 from schedule_items s where s.id = c.schedule_item_id)
      group by c.profile_id
      union all
      select l.profile_id, 'Chips for a task the server never got', count(*)::int
      from chip_ledger l
      where l.deleted_at is null and l.reason in ('task', 'routine') and l.ref_id is not null
        and not exists (select 1 from schedule_items s where s.id = l.ref_id)
        -- First-Then chips point at the activity, not a schedule item (lib/data/firstThen.ts).
        and not exists (select 1 from activities a where a.id = l.ref_id)
      group by l.profile_id
      union all
      select s.profile_id, 'Schedule items with no activity', count(*)::int
      from schedule_items s
      where s.deleted_at is null and not exists (select 1 from activities a where a.id = s.activity_id)
      group by s.profile_id
    )
    select f.profile_id, p.name as profile_name, a.name as account_name, f.kind, f.count
    from found f
    left join profiles p on p.id = f.profile_id
    left join accounts a on a.id = p.account_id
    order by f.count desc, f.profile_id
  `;
}

/** Devices that say they hold unsent writes. */
export async function devicesWithBacklog(): Promise<AdminSyncDevice[]> {
  const rows = await sql<(Omit<AdminSyncDevice, 'last_seen_at' | 'sync_reported_at' | 'oldest_at'> & { last_seen_at: string; sync_reported_at: string | null; oldest_at: string | null })[]>`
    select d.id, u.email as user_email, d.name, d.platform, d.last_seen_at, d.sync_reported_at,
           coalesce(d.sync_pending, 0) as pending, d.sync_oldest_at as oldest_at,
           coalesce(d.sync_held, 0) as held, coalesce(d.sync_dead, 0) as dead
    from devices d left join users u on u.id = d.user_id
    where coalesce(d.sync_pending, 0) > 0 or coalesce(d.sync_held, 0) > 0 or coalesce(d.sync_dead, 0) > 0
    order by d.sync_oldest_at nulls last
    limit 200
  `;
  return rows.map((r) => ({
    ...r,
    last_seen_at: Number(r.last_seen_at),
    sync_reported_at: r.sync_reported_at === null ? null : Number(r.sync_reported_at),
    oldest_at: r.oldest_at === null ? null : Number(r.oldest_at),
  }));
}

/** A device's unsent writes are worth a mail when they are this old, or the device has gone quiet holding them. */
const BACKLOG_OLD_MS = 6 * HOUR_MS;

export function backlogNeedsAttention(device: Pick<AdminSyncDevice, 'pending' | 'oldest_at' | 'dead' | 'sync_reported_at'>, now: number): boolean {
  if (device.dead > 0) return true;
  if (device.pending === 0) return false;
  if (device.oldest_at !== null && now - device.oldest_at > BACKLOG_OLD_MS) return true;
  return device.sync_reported_at !== null && now - device.sync_reported_at > DAY_MS;
}

/** A refusal still open is worth a mail after an hour, or after a day when it is the kind that clears by itself. */
export function rejectionNeedsAttention(rejection: Pick<AdminSyncRejection, 'reason' | 'created_at' | 'resolved_at'>, now: number): boolean {
  if (rejection.resolved_at !== null) return false;
  return now - rejection.created_at > (isHeldReason(rejection.reason) ? DAY_MS : HOUR_MS);
}

export async function listRejections(limit = 300): Promise<AdminSyncRejection[]> {
  const rows = await sql<(Omit<AdminSyncRejection, 'created_at' | 'last_seen_at' | 'resolved_at'> & { created_at: string; last_seen_at: string; resolved_at: string | null })[]>`
    select r.id, r.created_at, r.last_seen_at, r.seen_count, u.email as user_email, r.profile_id, p.name as profile_name,
           a.name as account_name, r.device_id, r.table_name, r.row_id, r.op, r.reason, r.source, r.locked,
           (r.payload is not null) as has_payload, r.resolved_at, r.resolution
    from sync_rejections r
    left join users u on u.id = r.user_id
    left join profiles p on p.id = r.profile_id
    left join accounts a on a.id = p.account_id
    order by (r.resolved_at is not null), r.created_at desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    ...r,
    created_at: Number(r.created_at),
    last_seen_at: Number(r.last_seen_at),
    resolved_at: r.resolved_at === null ? null : Number(r.resolved_at),
  }));
}

export async function syncHealth(now = Date.now()): Promise<AdminSyncHealth> {
  const [rejections, devices, orphans] = await Promise.all([listRejections(), devicesWithBacklog(), findOrphans()]);
  const [{ open } = { open: 0 }] = await sql<{ open: number }[]>`select count(*)::int as open from sync_rejections where resolved_at is null`;
  const attention =
    orphans.length > 0 || rejections.some((r) => rejectionNeedsAttention(r, now)) || devices.some((d) => backlogNeedsAttention(d, now));
  return { attention, open_rejections: open, rejections, devices, orphans };
}

export interface DigestSummary {
  rejections: number;
  devices: number;
  orphan_rows: number;
  orphan_people: number;
}

/** Pure: one line per kind of trouble, none when there is nothing to say (and then no mail goes). */
export function digestLines(summary: DigestSummary): string[] {
  const { rejections, devices, orphan_rows: rows, orphan_people: people } = summary;
  return [
    ...(rejections > 0 ? [`${rejections} refused change${rejections === 1 ? ' is' : 's are'} still not saved.`] : []),
    ...(devices > 0 ? [`${devices} device${devices === 1 ? ' is' : 's are'} holding changes that have not reached the server.`] : []),
    ...(rows > 0 ? [`${rows} row${rows === 1 ? '' : 's'} for ${people} ${people === 1 ? 'person point' : 'people point'} at something the server never received.`] : []),
  ];
}

/** The UTC hour after which the day's mail may go. */
const DIGEST_HOUR_UTC = 13;

/**
 * Once a day, and only when something needs a person: refusals still open,
 * devices sitting on unsent writes, and rows pointing at nothing. Safe to
 * call as often as you like; sync_health_digests makes it once per day even
 * across restarts. Returns whether a mail went out.
 */
export async function sendSyncHealthDigest(now = Date.now()): Promise<boolean> {
  const at = new Date(now);
  if (at.getUTCHours() < DIGEST_HOUR_UTC) return false;
  const day = at.toISOString().slice(0, 10);
  const [already] = await sql`select 1 from sync_health_digests where day = ${day}`;
  if (already) return false;

  const health = await syncHealth(now);
  const stuck = health.rejections.filter((r) => rejectionNeedsAttention(r, now));
  const devices = health.devices.filter((d) => backlogNeedsAttention(d, now));
  const orphanRows = health.orphans.reduce((sum, o) => sum + o.count, 0);
  const summary: DigestSummary = { rejections: stuck.length, devices: devices.length, orphan_rows: orphanRows, orphan_people: new Set(health.orphans.map((o) => o.profile_id)).size };

  const claimed = await sql`
    insert into sync_health_digests (day, sent_at, summary) values (${day}, ${now}, ${JSON.stringify(summary)}::jsonb)
    on conflict (day) do nothing returning day
  `;
  if (claimed.length === 0) return false;
  if (digestLines(summary).length === 0) return false;

  const lines = digestLines(summary);
  const mail = renderEmail({
    heading: 'Sync needs a look',
    paragraphs: ['This is the daily check of what devices have not managed to save.', lines.join('\n')],
    action: { label: 'Open sync health', url: adminUrl() },
    note: 'You get this once a day for as long as something is open.',
  });
  for (const to of alertRecipients()) await sendMail({ to, subject: 'Chipperly: sync needs a look', ...mail });
  return true;
}

/** ponytail: an in-process timer, like lib/reminders.ts; the digest table keeps it to one mail a day. */
export function startSyncHealth(log: (err: unknown) => void): () => void {
  const run = (): void => void Promise.all([alertNewRejections(), sendSyncHealthDigest()]).catch(log);
  const handle = setInterval(run, 15 * 60 * 1000);
  return () => clearInterval(handle);
}
