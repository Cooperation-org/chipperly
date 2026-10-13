import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { TRIAL_DAYS } from '@chipperly/shared/schemas/billing';
import type { Handover, HandoverReason } from '@chipperly/shared/schemas/handover';
import { db } from '../db/client.js';
import { account_members, accounts, users } from '../db/schema/accounts.js';
import { family_handovers } from '../db/schema/handovers.js';
import { media } from '../db/schema/media.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import { day_plans, schedule_items, step_completions } from '../db/schema/schedule.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { chip_ledger } from '../db/schema/chips.js';
import { mood_events } from '../db/schema/mood.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { day_events } from '../db/schema/events.js';
import { AppError } from '../plugins/errors.js';
import { siteOrigin, renderEmail } from './emailTemplate.js';
import { sendMail } from './mailer.js';
import { accountAccess, trialEndsAt } from './trial.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HANDOVER_TTL_MS = 30 * DAY_MS;
const CHUNK = 500;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Syncable = typeof locations;

const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/** Every person-scoped synced table. Soft-deleted rows are left behind; everything else is copied. */
const COPIED_TABLES = {
  locations,
  activities,
  activity_steps,
  recurrence_skips,
  rewards,
  schedule_items,
  day_plans,
  step_completions,
  social_stories,
  story_pages,
  chip_ledger,
  mood_events,
  attitude_checks,
  day_events,
};

/** Columns that point at another copied row (or at a media row); remapped to the new ids. */
const MEDIA_KEYS = ['photo_id', 'cover_photo_id', 'audio_id'];
const REF_KEYS = new Set([
  ...MEDIA_KEYS,
  'location_id',
  'working_for_reward_id',
  'activity_id',
  'parent_step_id',
  'goal_reward_id',
  'schedule_item_id',
  'activity_step_id',
  'story_id',
  'requires_activity_id',
  'ref_id',
]);
/** Who did it: in the new account there is only the family user. */
const WHO_KEYS = new Set(['updated_by', 'created_by', 'completed_by']);

const chunks = <T>(rows: T[]): T[][] => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Copies one person and everything of theirs into a brand-new account, with new ids and nothing shared with
 * the source account. Pictures and voice clips get their own media rows (same stored file, so they still load
 * and the org's copy is untouched). Runs inside the caller's transaction.
 */
export async function copyProfileToAccount(
  tx: Tx,
  profileId: string,
  toAccountId: string,
  userId: string,
): Promise<string> {
  const [profile] = await tx.select().from(profiles).where(and(eq(profiles.id, profileId), isNull(profiles.deleted_at))).limit(1);
  if (!profile) throw new AppError(404, 'not_found', 'Person not found');
  const now = Date.now();
  const newProfileId = uuidv7();

  const rowsByTable = new Map<string, Record<string, unknown>[]>();
  for (const [name, table] of Object.entries(COPIED_TABLES)) {
    const t = table as Syncable;
    rowsByTable.set(name, (await tx.select().from(t).where(and(eq(t.profile_id, profileId), isNull(t.deleted_at))) as Record<string, unknown>[]));
  }

  // Old id -> new id for every copied row, then for every media row they use.
  const ids = new Map<string, string>();
  for (const rows of rowsByTable.values()) for (const r of rows) ids.set(r.id as string, uuidv7());
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const mediaIds = new Set<string>();
  const addMedia = (v: unknown): void => {
    if (typeof v === 'string') mediaIds.add(v);
  };
  addMedia(profile.avatar_photo_id);
  addMedia(settings.first_then_first_audio_id);
  addMedia(settings.first_then_then_audio_id);
  for (const k of Object.keys((settings.image_credits ?? {}) as object)) addMedia(k);
  for (const rows of rowsByTable.values()) for (const r of rows) for (const k of MEDIA_KEYS) addMedia(r[k]);
  if (mediaIds.size > 0) {
    const sources = await tx.select().from(media).where(and(eq(media.account_id, profile.account_id), inArray(media.id, [...mediaIds])));
    for (const m of sources) {
      const id = uuidv7();
      ids.set(m.id, id);
      await tx.insert(media).values({ ...m, id, account_id: toAccountId, created_by: userId, created_at: now });
    }
  }

  const rm = (v: unknown): string | null => (typeof v === 'string' ? (ids.get(v) ?? null) : null);

  for (const [name, rows] of rowsByTable) {
    const out = rows.map((r) => {
      const row: Record<string, unknown> = { ...r, id: ids.get(r.id as string), profile_id: newProfileId, client_updated_at: now };
      for (const key of Object.keys(row)) {
        if (REF_KEYS.has(key)) row[key] = rm(row[key]);
        else if (WHO_KEYS.has(key) && row[key] !== null) row[key] = userId;
        else if (key === 'location_ids' && Array.isArray(row[key])) row[key] = (row[key] as string[]).map(rm).filter((x) => x !== null);
        else if (key === 'positions' && row[key] && typeof row[key] === 'object') {
          // Order inside each place, keyed by place id ('all' stays).
          row[key] = Object.fromEntries(Object.entries(row[key] as Record<string, number>).flatMap(([k, v]) => (k === 'all' ? [[k, v]] : rm(k) ? [[rm(k), v]] : [])));
        }
      }
      return row;
    });
    for (const part of chunks(out)) await tx.insert(COPIED_TABLES[name as keyof typeof COPIED_TABLES]).values(part as never);
  }

  const newSettings: Record<string, unknown> = { ...settings };
  for (const k of ['first_then_first_audio_id', 'first_then_then_audio_id', 'day_goal_reward_id']) if (k in newSettings) newSettings[k] = rm(newSettings[k]);
  const progress = settings.first_then_progress as { first_id: string; then_id: string } | null | undefined;
  if (progress) {
    const first = rm(progress.first_id);
    const then = rm(progress.then_id);
    newSettings.first_then_progress = first && then ? { ...progress, first_id: first, then_id: then } : null;
  }
  if (settings.image_credits) {
    newSettings.image_credits = Object.fromEntries(Object.entries(settings.image_credits as object).flatMap(([k, v]) => (rm(k) ? [[rm(k), v]] : [])));
  }

  await tx.insert(profiles).values({
    id: newProfileId,
    account_id: toAccountId,
    name: profile.name,
    avatar_emoji: profile.avatar_emoji,
    avatar_photo_id: rm(profile.avatar_photo_id),
    share_token: null,
    first_then_activity_id: rm(profile.first_then_activity_id),
    first_then_reward_id: rm(profile.first_then_reward_id),
    settings: newSettings,
    cluster_id: null,
    archived_at: null,
    client_updated_at: now,
    updated_by: userId,
    deleted_at: null,
  });
  return newProfileId;
}

// ---------------------------------------------------------------------------
// Who is offered a copy, and the email
// ---------------------------------------------------------------------------

const PARENT_LABELS = ['parent', 'mother', 'father', 'mom', 'mum', 'dad', 'guardian'];

/** A Family (viewer) member, or a Staff or Moderator whose relationship says parent. */
const familyRole = or(
  eq(account_members.role, 'viewer'),
  and(
    inArray(account_members.role, ['member', 'moderator'] as never[]),
    inArray(sql<string>`lower(trim(${profile_members.relationship_label}))`, PARENT_LABELS),
  ),
);

/** The family users linked to a person in the person's own account. */
export async function linkedFamily(profileId: string): Promise<{ id: string; email: string }[]> {
  return db
    .selectDistinct({ id: users.id, email: users.email })
    .from(profile_members)
    .innerJoin(profiles, eq(profiles.id, profile_members.profile_id))
    .innerJoin(account_members, and(eq(account_members.account_id, profiles.account_id), eq(account_members.user_id, profile_members.user_id)))
    .innerJoin(users, eq(users.id, profile_members.user_id))
    .where(and(eq(profile_members.profile_id, profileId), isNull(users.deactivated_at), familyRole))
    .orderBy(users.email);
}

/** Records the offer and mails the link. Once per person, user and trigger: false when it was already sent. */
export async function offerHandover(profileId: string, user: { id: string; email: string }, reason: HandoverReason): Promise<boolean> {
  const [info] = await db
    .select({ name: profiles.name, org: accounts.name })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.account_id))
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!info) return false;
  const raw = randomBytes(32).toString('base64url');
  const now = Date.now();
  const inserted = await db
    .insert(family_handovers)
    .values({ id: uuidv7(), profile_id: profileId, user_id: user.id, token_hash: hashToken(raw), reason, created_at: now, used_at: null, expires_at: now + HANDOVER_TTL_MS })
    .onConflictDoNothing()
    .returning({ id: family_handovers.id });
  if (inserted.length === 0) return false;
  await sendMail({
    to: user.email,
    subject: `Keep ${info.name}'s Chipperly`,
    ...renderEmail({
      heading: `Keep ${info.name}'s Chipperly`,
      paragraphs: [
        `${info.org} no longer covers ${info.name} on Chipperly.`,
        `You can keep a copy of ${info.name}'s Chipperly in your own account. Everything comes with it: routines, rewards, chips, stories and pictures. It starts with a free trial.`,
      ],
      action: { label: 'Keep a copy', url: `${siteOrigin()}/keep/?token=${raw}` },
      note: 'This link works once and expires in 30 days.',
    }),
  });
  return true;
}

/** An org archived this person: offer a copy to everyone linked to them. */
export async function offerHandoversForProfile(profileId: string, reason: HandoverReason): Promise<number> {
  let sent = 0;
  for (const user of await linkedFamily(profileId)) if (await offerHandover(profileId, user, reason)) sent++;
  return sent;
}

/** The people a family member is linked to in an organization (empty for other kinds). Read BEFORE their links are deleted. */
export async function familyLinksOf(accountId: string, userId: string): Promise<{ profile_id: string; user: { id: string; email: string } }[]> {
  const rows = await db
    .select({ profile_id: profiles.id, email: users.email })
    .from(profile_members)
    .innerJoin(profiles, and(eq(profiles.id, profile_members.profile_id), eq(profiles.account_id, accountId), isNull(profiles.deleted_at)))
    .innerJoin(accounts, and(eq(accounts.id, accountId), eq(accounts.kind, 'agency')))
    .innerJoin(account_members, and(eq(account_members.account_id, accountId), eq(account_members.user_id, profile_members.user_id)))
    .innerJoin(users, eq(users.id, profile_members.user_id))
    .where(and(eq(profile_members.user_id, userId), isNull(users.deactivated_at), familyRole));
  return rows.map((r) => ({ profile_id: r.profile_id, user: { id: userId, email: r.email } }));
}

/** An org removed a family member: offer them a copy of each person they were linked to. */
export async function offerHandoversForLinks(links: Awaited<ReturnType<typeof familyLinksOf>>): Promise<number> {
  let sent = 0;
  for (const l of links) if (await offerHandover(l.profile_id, l.user, 'removed')) sent++;
  return sent;
}

/** The daily check: every organization whose access has lapsed offers each active person's family a copy. */
export async function sendLapsedHandovers(at = Date.now()): Promise<number> {
  const orgs = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.kind, 'agency'));
  let sent = 0;
  for (const org of orgs) {
    if ((await accountAccess(org.id, at)).state !== 'lapsed') continue;
    const people = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.account_id, org.id), isNull(profiles.deleted_at), isNull(profiles.archived_at)));
    for (const p of people) sent += await offerHandoversForProfile(p.id, 'lapsed');
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Using an offer
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds the offer by its emailed token, or by its id (the in-app banner), and checks it belongs to this
 * user, is unused, unexpired and that the reason still holds. Only the linked user ever gets past this:
 * anyone else gets the same 404 as a wrong link.
 */
async function openOffer(key: string, userId: string, now: number) {
  const where = UUID.test(key) ? eq(family_handovers.id, key) : eq(family_handovers.token_hash, hashToken(key));
  const [row] = await db.select().from(family_handovers).where(where).limit(1);
  if (!row || row.user_id !== userId) throw new AppError(404, 'not_found', 'This link is not valid');
  if (row.used_at !== null) throw new AppError(410, 'handover_used', 'This link was already used');
  if (row.expires_at <= now) throw new AppError(410, 'handover_expired', 'This link has expired');
  const [info] = await db
    .select({ name: profiles.name, account_id: profiles.account_id, archived_at: profiles.archived_at, deleted_at: profiles.deleted_at, org: accounts.name })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.account_id))
    .where(eq(profiles.id, row.profile_id))
    .limit(1);
  if (!info || info.deleted_at !== null) throw new AppError(404, 'not_found', 'This link is not valid');
  if (!(await stillApplies(row.reason, row.user_id, info.account_id, info.archived_at, now))) {
    throw new AppError(409, 'handover_inactive', 'This organization covers this person again');
  }
  return { row, name: info.name, org: info.org };
}

async function stillApplies(reason: HandoverReason, userId: string, accountId: string, archivedAt: number | null, now: number): Promise<boolean> {
  if (reason === 'archived') return archivedAt !== null;
  if (reason === 'lapsed') return (await accountAccess(accountId, now)).state === 'lapsed';
  const [member] = await db
    .select({ role: account_members.role })
    .from(account_members)
    .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, userId)))
    .limit(1);
  return !member;
}

export async function describeOffer(key: string, userId: string, now = Date.now()): Promise<Handover> {
  const { row, name, org } = await openOffer(key, userId, now);
  return { id: row.id, profile_name: name, org_name: org, reason: row.reason };
}

/** The open offers for the in-app banner. */
export async function openOffersFor(userId: string, now = Date.now()): Promise<Handover[]> {
  const rows = await db
    .select({ id: family_handovers.id })
    .from(family_handovers)
    .where(and(eq(family_handovers.user_id, userId), isNull(family_handovers.used_at), sql`${family_handovers.expires_at} > ${now}`));
  const out: Handover[] = [];
  for (const r of rows) {
    try {
      out.push(await describeOffer(r.id, userId, now));
    } catch {
      // No longer applies, or the person is gone: not shown.
    }
  }
  return out;
}

/** Creates the family's own account (one supported person, owned by them, normal trial) and copies the person into it. */
export async function acceptOffer(key: string, userId: string, now = Date.now()): Promise<{ account_id: string; profile_id: string }> {
  const { row, name } = await openOffer(key, userId, now);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'This link is not valid');
  return db.transaction(async (tx) => {
    // Single use: only one request flips used_at, and a failed copy rolls it back.
    const claimed = await tx
      .update(family_handovers)
      .set({ used_at: now })
      .where(and(eq(family_handovers.id, row.id), isNull(family_handovers.used_at)))
      .returning({ id: family_handovers.id });
    if (claimed.length === 0) throw new AppError(410, 'handover_used', 'This link was already used');

    const accountId = uuidv7();
    await tx.insert(accounts).values({ id: accountId, kind: 'supported', name, created_at: now, owner_user_id: userId });
    await tx.insert(account_members).values({ account_id: accountId, user_id: userId, role: 'admin' });
    // The normal trial: a family member who signed up long ago would otherwise start already lapsed.
    if (trialEndsAt(user) < now + TRIAL_DAYS * DAY_MS) await tx.update(users).set({ trial_ends_at: now + TRIAL_DAYS * DAY_MS }).where(eq(users.id, userId));
    const profileId = await copyProfileToAccount(tx, row.profile_id, accountId, userId);
    return { account_id: accountId, profile_id: profileId };
  });
}
