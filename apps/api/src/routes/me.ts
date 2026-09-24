import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import type { UserPublic } from '@chipperly/shared/schemas/account';
import { PinBodySchema, type ExportResponse, type MeAccount, type MeResponse } from '@chipperly/shared/schemas/auth';
import { RegisterPushTokenBodySchema, UnregisterPushTokenBodySchema } from '@chipperly/shared/schemas/push';
import {
  RegisterDeviceBodySchema,
  UpdateDeviceBodySchema,
  ReportInstalledAppsBodySchema,
  ReportLockStateBodySchema,
  type Device,
  type RegisterDeviceResponse,
} from '@chipperly/shared/schemas/device';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { TABLE_NAMES } from '@chipperly/shared/constants/tables';
import { db, sql } from '../db/client.js';
import { env } from '../env.js';
import { account_members, accounts, invites, promo_codes, review_reminders, sessions, users } from '../db/schema/accounts.js';
import {
  ClaimPromoBodySchema,
  DEFAULT_REVIEW_REMINDER,
  ReviewReminderSchema,
  TimeZoneBodySchema,
  type ReviewReminder,
} from '@chipperly/shared/schemas/billing';
import { isSuperAdmin, trialEndsAt } from '../lib/trial.js';
import { push_tokens } from '../db/schema/push.js';
import { devices } from '../db/schema/devices.js';
import { profile_members, profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps, recurrence_skips } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { social_stories, story_pages } from '../db/schema/stories.js';
import { attitude_checks } from '../db/schema/attitude.js';
import { media } from '../db/schema/media.js';
import { hashPin, verifyPin } from '../lib/password.js';
import { sendDataMessage } from '../lib/push.js';
import { canAccessProfile, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { normalizeRow } from './sync.js';

const LockBodySchema = z.object({
  profile_id: uuidSchema,
  /** "Lock phone": also turn on the profile's app blocking. A plain lock (pin the app) leaves it as it is. */
  block_apps: z.boolean().optional(),
});
const deviceIdParamSchema = z.object({ id: uuidSchema });
const RestBodySchema = z.object({ resting: z.boolean() });
const FreeBodySchema = z.object({ minutes: z.number().int().min(0).max(24 * 60) });

/**
 * Shared by /locate, /lock and /unlock: all three are "caregiver, from any
 * signed-in device, fire a data-only push naming a request type at one of
 * their own devices" with nothing else that varies. 404s on a device that
 * doesn't belong to the caller rather than silently doing nothing, same as
 * every other /me/devices/:id route. Returns the device's profile_id too,
 * for lock/unlock to also flip that profile's child_mode_active -- the two
 * settings used to be independent, which read as "unlocking doesn't
 * actually let all apps open again."
 */
async function sendDeviceRequest(
  userId: string,
  deviceId: string,
  type: string,
  extra: Record<string, string> = {},
): Promise<{ ok: true; sent: boolean; profile_id: string | null }> {
  const [device] = await db
    .select({ id: devices.id, profile_id: devices.profile_id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.user_id, userId)));
  if (!device) throw new AppError(404, 'not_found', 'Device not found');

  const tokenRows = await db.select({ token: push_tokens.token }).from(push_tokens).where(eq(push_tokens.device_id, deviceId));
  if (tokenRows.length === 0) return { ok: true, sent: false, profile_id: device.profile_id };

  const sent = await sendDataMessage({ tokens: tokenRows.map((t) => t.token), data: { type, ...extra } });
  return { ok: true, sent, profile_id: device.profile_id };
}

/** One profile setting, server-side, for the device routes below: resting, unrestricted_until. */
async function setProfileSetting(profileId: string | null, key: 'resting' | 'unrestricted_until', value: boolean | number | null): Promise<void> {
  if (!profileId) return;
  await db
    .update(profiles)
    .set({
      settings: drizzleSql`jsonb_set(${profiles.settings}, ${`{${key}}`}::text[], ${JSON.stringify(value)}::jsonb)`,
      client_updated_at: Date.now(),
    })
    .where(eq(profiles.id, profileId));
}

/** Lock and Unlock are the one control for "is app blocking on": no more separate always-on allow-list toggle that a locked/unlocked device disagreed with. No-ops if this device was never assigned to a profile (Settings > Devices > Used by). */
async function setChildModeActive(profileId: string | null, active: boolean): Promise<void> {
  if (!profileId) return;
  await db
    .update(profiles)
    .set({ settings: drizzleSql`jsonb_set(${profiles.settings}, '{child_mode_active}', ${JSON.stringify(active)}::jsonb)` })
    .where(eq(profiles.id, profileId));
}

export default async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireUser }, async (request): Promise<MeResponse> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        pin_hash: users.pin_hash,
        email_verified_at: users.email_verified_at,
        created_at: users.created_at,
        auth_provider: users.auth_provider,
        trial_ends_at: users.trial_ends_at,
        promo_code: users.promo_code,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const { trial_ends_at: _trial, promo_code: promoCode, ...publicFields } = userRow;
    const [promo] = promoCode
      ? await db.select({ code: promo_codes.code, percent_off: promo_codes.percent_off }).from(promo_codes).where(eq(promo_codes.code, promoCode)).limit(1)
      : [];
    const user: UserPublic = {
      ...publicFields,
      trial_ends_at: trialEndsAt(userRow),
      promo: promo ?? null,
      is_super_admin: isSuperAdmin(userRow.email),
    };

    const memberships = await db.select().from(account_members).where(eq(account_members.user_id, userId));
    const accountIds = memberships.map((m) => m.account_id);
    const accountRows =
      accountIds.length > 0 ? await db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];
    const roleByAccountId = new Map(memberships.map((m) => [m.account_id, m.role]));
    const meAccounts: MeAccount[] = accountRows.map((account) => ({
      account,
      role: roleByAccountId.get(account.id) ?? 'member',
    }));

    const adminAccountIds = memberships.filter((m) => m.role === 'admin').map((m) => m.account_id);
    const adminProfiles =
      adminAccountIds.length > 0
        ? await db
            .select()
            .from(profiles)
            .where(and(inArray(profiles.account_id, adminAccountIds), isNull(profiles.deleted_at)))
        : [];
    const memberProfileRows = await db
      .select({ profile: profiles })
      .from(profile_members)
      .innerJoin(profiles, eq(profile_members.profile_id, profiles.id))
      .where(and(eq(profile_members.user_id, userId), isNull(profiles.deleted_at)));

    const profileById = new Map<string, Profile>();
    for (const profile of adminProfiles) profileById.set(profile.id, profile);
    for (const { profile } of memberProfileRows) profileById.set(profile.id, profile);

    return {
      user,
      accounts: meAccounts,
      profiles: [...profileById.values()],
    };
  });

  /** S30 "Download my data" (SOW Q21): every record the signed-in user can see, as one JSON file. */
  app.get('/me/export', { preHandler: requireUser }, async (request): Promise<ExportResponse> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        email_verified_at: users.email_verified_at,
        created_at: users.created_at,
        auth_provider: users.auth_provider,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRow) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const memberships = await db.select().from(account_members).where(eq(account_members.user_id, userId));
    const accountIds = memberships.map((m) => m.account_id);
    const accountRows =
      accountIds.length > 0 ? await db.select().from(accounts).where(inArray(accounts.id, accountIds)) : [];

    const adminAccountIds = memberships.filter((m) => m.role === 'admin').map((m) => m.account_id);
    const adminProfiles =
      adminAccountIds.length > 0
        ? await db
            .select()
            .from(profiles)
            .where(and(inArray(profiles.account_id, adminAccountIds), isNull(profiles.deleted_at)))
        : [];
    const memberProfileRows = await db
      .select({ profile: profiles })
      .from(profile_members)
      .innerJoin(profiles, eq(profile_members.profile_id, profiles.id))
      .where(and(eq(profile_members.user_id, userId), isNull(profiles.deleted_at)));

    const profileById = new Map<string, Profile>();
    for (const profile of adminProfiles) profileById.set(profile.id, profile);
    for (const { profile } of memberProfileRows) profileById.set(profile.id, profile);
    const exportProfiles = [...profileById.values()];

    // ponytail: tombstoned (deleted_at set) rows are left out — a parent asking
    // "what do you have on my child" wants what's live, not what they already
    // deleted. Same 12-table list and per-profile_id read as routes/sync.ts's
    // pull, just unfiltered by version and read once instead of paginated.
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of TABLE_NAMES) tables[table] = [];
    for (const profile of exportProfiles) {
      for (const table of TABLE_NAMES) {
        // eslint-disable-next-line no-await-in-loop -- export-only, small N; not worth parallelizing.
        const rows = await sql`select * from ${sql(table)} where profile_id = ${profile.id} and deleted_at is null`;
        for (const row of rows) tables[table].push(normalizeRow(row));
      }
    }

    const mediaRows =
      accountIds.length > 0 ? await db.select().from(media).where(inArray(media.account_id, accountIds)) : [];

    return {
      exported_at: Date.now(),
      user: userRow,
      accounts: accountRows,
      memberships: memberships.map((m) => ({ account_id: m.account_id, role: m.role })),
      profiles: exportProfiles,
      tables,
      media: mediaRows.map((m) => ({
        id: m.id,
        url: `${env.BASE_PATH}/api/media/${m.id}`,
        kind: m.kind,
        created_at: m.created_at,
      })),
    };
  });

  app.patch('/me/pin', { preHandler: requireUser }, async (request): Promise<{ pin_hash: string }> => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const body = PinBodySchema.parse(request.body);
    const pinHash = await hashPin(body.pin);
    await db.update(users).set({ pin_hash: pinHash }).where(eq(users.id, authUser.id));

    return { pin_hash: pinHash };
  });

  /**
   * Registers/refreshes this device's push token. Upsert on device_id too
   * (not just insert-or-ignore): a token rarely changes which device it
   * belongs to, but self-healing a stale/missing device_id here is free and
   * keeps locate-request (below) working after e.g. a token registered
   * before devices.ts existed.
   */
  app.put('/me/push-token', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const body = RegisterPushTokenBodySchema.parse(request.body);
    await db
      .insert(push_tokens)
      .values({ user_id: authUser.id, token: body.token, platform: body.platform, device_id: body.device_id, created_at: Date.now() })
      .onConflictDoUpdate({
        target: [push_tokens.user_id, push_tokens.token],
        set: { platform: body.platform, device_id: body.device_id },
      });
    return { ok: true };
  });

  /** Claims an early access code: it must exist, be active, and be claimed inside its dates. One code per person. */
  app.post('/me/promo-code', { preHandler: requireUser }, async (request): Promise<{ code: string; percent_off: number | null }> => {
    const { code } = ClaimPromoBodySchema.parse(request.body);
    const [promo] = await db.select().from(promo_codes).where(eq(promo_codes.code, code.toUpperCase())).limit(1);
    const at = Date.now();
    if (!promo || !promo.active || at < promo.valid_from || at > promo.valid_until) {
      throw new AppError(404, 'promo_not_found', "That code isn't valid (or has ended).");
    }
    await db.update(users).set({ promo_code: promo.code, promo_code_at: at }).where(eq(users.id, request.user!.id));
    return { code: promo.code, percent_off: promo.percent_off };
  });

  /** The app's time zone, so routine reminders (lib/reminders.ts) arrive at the chosen local hour. */
  app.put('/me/time-zone', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const { time_zone } = TimeZoneBodySchema.parse(request.body);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: time_zone });
    } catch {
      throw new AppError(400, 'bad_time_zone', 'Unknown time zone');
    }
    await db.update(users).set({ time_zone }).where(eq(users.id, request.user!.id));
    return { ok: true };
  });

  /** This caregiver's "remind me to check this child's routines" choice (default weekly at 7 pm). */
  app.get('/profiles/:id/review-reminder', { preHandler: requireUser }, async (request): Promise<ReviewReminder> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    if (!(await canAccessProfile(request.user!.id, id))) throw new AppError(403, 'forbidden', 'Cannot access this profile');
    const [row] = await db
      .select({ every_days: review_reminders.every_days, hour: review_reminders.hour })
      .from(review_reminders)
      .where(and(eq(review_reminders.user_id, request.user!.id), eq(review_reminders.profile_id, id)))
      .limit(1);
    return row ? ReviewReminderSchema.parse(row) : DEFAULT_REVIEW_REMINDER;
  });

  app.put('/profiles/:id/review-reminder', { preHandler: requireUser }, async (request): Promise<ReviewReminder> => {
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    if (!(await canAccessProfile(request.user!.id, id))) throw new AppError(403, 'forbidden', 'Cannot access this profile');
    const body = ReviewReminderSchema.parse(request.body);
    await db
      .insert(review_reminders)
      .values({ user_id: request.user!.id, profile_id: id, ...body })
      .onConflictDoUpdate({ target: [review_reminders.user_id, review_reminders.profile_id], set: body });
    return body;
  });

  /** The VAPID public key a browser subscribes to push with; null when web push isn't configured. */
  app.get('/me/push/web-key', { preHandler: requireUser }, async (): Promise<{ key: string | null }> => ({
    key: env.webPushEnabled ? env.VAPID_PUBLIC_KEY! : null,
  }));

  /** Called on sign-out/unregister so a stale token isn't pushed to after the device stops wanting it. */
  app.delete('/me/push-token', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const body = UnregisterPushTokenBodySchema.parse(request.body);
    await db.delete(push_tokens).where(and(eq(push_tokens.user_id, authUser.id), eq(push_tokens.token, body.token)));
    return { ok: true };
  });

  /**
   * The caregiver's named device list (Settings > Devices), so it's visible
   * from any signed-in device, including a laptop browser. An explicit
   * column list, not `select()`, so a new column (report_token) is never
   * accidentally exposed here just by existing in the table -- it's a
   * per-device secret (devices.ts), not something any of the caregiver's
   * own other devices/browsers needs to see.
   */
  app.get('/me/devices', { preHandler: requireUser }, async (request): Promise<{ devices: Device[] }> => {
    const authUser = request.user!;
    const rows = await db
      .select({
        id: devices.id,
        name: devices.name,
        profile_id: devices.profile_id,
        platform: devices.platform,
        last_seen_at: devices.last_seen_at,
        created_at: devices.created_at,
        last_lat: devices.last_lat,
        last_lng: devices.last_lng,
        last_location_accuracy_m: devices.last_location_accuracy_m,
        last_location_at: devices.last_location_at,
        installed_apps: devices.installed_apps,
        locked: devices.locked,
      })
      .from(devices)
      .where(eq(devices.user_id, authUser.id))
      .orderBy(desc(devices.last_seen_at));
    return { devices: rows };
  });

  /**
   * Called by the device itself, on sign-in: creates the row on first sight
   * (name/profile_id null until the caregiver sets them), otherwise just
   * bumps last_seen_at/platform. Always returns this device's report_token
   * (generated once, stable across re-registrations) so the caller can
   * store it natively for the locate-request flow (lib/native/deviceLocator.ts).
   */
  app.put('/me/devices/:id', { preHandler: requireUser }, async (request): Promise<RegisterDeviceResponse> => {
    const authUser = request.user!;
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = RegisterDeviceBodySchema.parse(request.body);
    const now = Date.now();
    const reportToken = randomBytes(32).toString('base64url');
    const [row] = await db
      .insert(devices)
      .values({ id, user_id: authUser.id, platform: body.platform, last_seen_at: now, created_at: now, report_token: reportToken })
      .onConflictDoUpdate({
        target: devices.id,
        // coalesce, not overwrite: a device row created before report_token
        // existed (or any older client re-registering) must still get one
        // backfilled here, but a device that already has one keeps that
        // exact value stable -- devices.report_token is unqualified so it
        // resolves to the pre-update row, i.e. "keep mine unless I have none".
        set: {
          platform: body.platform,
          last_seen_at: now,
          report_token: drizzleSql`coalesce(${devices.report_token}, ${reportToken})`,
        },
      })
      .returning({ report_token: devices.report_token });
    return { ok: true, report_token: row!.report_token! };
  });

  /**
   * Called by the device itself (DeviceRegistrationGuard, Android only --
   * a no-op elsewhere since AppBlocker.listInstalledApps() returns [] on
   * web/iOS and that guard skips reporting an empty list) so a caregiver
   * on a *different* device can see and allow-list this device's real
   * installed apps from Settings > App blocking, not just the one it was
   * physically opened from.
   */
  app.put('/me/devices/:id/installed-apps', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = ReportInstalledAppsBodySchema.parse(request.body);

    const result = await db
      .update(devices)
      .set({ installed_apps: body.apps })
      .where(and(eq(devices.id, id), eq(devices.user_id, authUser.id)))
      .returning({ id: devices.id });
    if (result.length === 0) throw new AppError(404, 'not_found', 'Device not found');
    return { ok: true };
  });

  /**
   * Called by the device itself (LockTaskReconcileGuard's poll, same auth
   * as installed-apps above), whenever it checks its own OS lock-task
   * state -- so a caregiver on any device can see whether this one is
   * actually locked right now (GET /me/devices), not just guess from
   * whether a lock/unlock request was sent.
   */
  app.patch('/me/devices/:id/lock-state', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = ReportLockStateBodySchema.parse(request.body);

    const result = await db
      .update(devices)
      .set({ locked: body.locked })
      .where(and(eq(devices.id, id), eq(devices.user_id, authUser.id)))
      .returning({ id: devices.id });
    if (result.length === 0) throw new AppError(404, 'not_found', 'Device not found');
    return { ok: true };
  });

  /** Caregiver-triggered, from any signed-in device: asks the target device (Android only -- see lib/native/deviceLocator.ts) to report its current position. Fire-and-forget: the answer lands later via POST /devices/:id/location (routes/deviceLocation.ts) and shows up in a later GET /me/devices. */
  app.post('/me/devices/:id/locate', { preHandler: requireUser }, async (request): Promise<{ ok: true; sent: boolean }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const result = await sendDeviceRequest(request.user!.id, id, 'locate_request');
    return { ok: result.ok, sent: result.sent };
  });

  /**
   * Caregiver-triggered, from any signed-in device: asks the target device
   * (Android only -- see LocateRequestMessagingService's lock_request
   * handler in the native app) to engage its own already-synced app-blocking
   * allow-list as a real OS lock, exactly like tapping "Lock this device"
   * there in person. Also turns on the assigned profile's
   * child_mode_active: Lock is now the one control for "is app blocking
   * on", not a second, independent toggle a device could disagree with.
   */
  app.post('/me/devices/:id/lock', { preHandler: requireUser }, async (request): Promise<{ ok: true; sent: boolean }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const result = await sendDeviceRequest(request.user!.id, id, 'lock_request');
    await setChildModeActive(result.profile_id, true);
    return { ok: result.ok, sent: result.sent };
  });

  /** The other direction of /lock: same handler on the device, same "no reply to wait for" pattern, and turns child_mode_active back off so every app is reachable again -- see /lock's note on why the two used to disagree. */
  app.post('/me/devices/:id/unlock', { preHandler: requireUser }, async (request): Promise<{ ok: true; sent: boolean }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const result = await sendDeviceRequest(request.user!.id, id, 'unlock_request');
    await setChildModeActive(result.profile_id, false);
    return { ok: result.ok, sent: result.sent };
  });

  /**
   * "Phone is resting" on or off, from any signed-in device. The device
   * applies it natively from the push (LocateRequestMessagingService), so it
   * takes hold even with Chipperly in the background; the profile setting
   * is what the device reads back after a reboot or when it syncs.
   */
  app.post('/me/devices/:id/rest', { preHandler: requireUser }, async (request): Promise<{ ok: true; sent: boolean }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = RestBodySchema.parse(request.body);
    const result = await sendDeviceRequest(request.user!.id, id, body.resting ? 'rest_request' : 'wake_request');
    await setProfileSetting(result.profile_id, 'resting', body.resting);
    return { ok: result.ok, sent: result.sent };
  });

  /** Whole-phone free time for `minutes` (0 ends it now), from any signed-in device. */
  app.post('/me/devices/:id/free', { preHandler: requireUser }, async (request): Promise<{ ok: true; sent: boolean; until: number | null }> => {
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = FreeBodySchema.parse(request.body);
    const until = body.minutes > 0 ? Date.now() + body.minutes * 60_000 : null;
    const result = await sendDeviceRequest(request.user!.id, id, 'free_request', { until: String(until ?? 0) });
    await setProfileSetting(result.profile_id, 'unrestricted_until', until);
    return { ok: result.ok, sent: result.sent, until };
  });

  /** Called by a caregiver, from any device, to name/reassign one already in the list -- never creates a row. */
  app.patch('/me/devices/:id', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const { id } = deviceIdParamSchema.parse(request.params);
    const body = UpdateDeviceBodySchema.parse(request.body);

    if (body.profile_id) {
      const allowed = await canAccessProfile(authUser.id, body.profile_id);
      if (!allowed) throw new AppError(403, 'forbidden', "You don't have access to that profile");
    }

    const result = await db
      .update(devices)
      .set(body)
      .where(and(eq(devices.id, id), eq(devices.user_id, authUser.id)))
      .returning({ id: devices.id });
    if (result.length === 0) throw new AppError(404, 'not_found', 'Device not found');
    return { ok: true };
  });

  /** Drops a device from the caregiver's list, e.g. one that's been replaced or reset. */
  app.delete('/me/devices/:id', { preHandler: requireUser }, async (request): Promise<{ ok: true }> => {
    const authUser = request.user!;
    const { id } = deviceIdParamSchema.parse(request.params);
    await db.delete(devices).where(and(eq(devices.id, id), eq(devices.user_id, authUser.id)));
    return { ok: true };
  });

  /** S23 "Lock this device": marks this session child-locked. No PIN needed to lock, only to unlock. */
  app.post('/me/lock', { preHandler: requireUser }, async (request): Promise<{ locked_profile_id: string }> => {
    const authUser = request.user!;
    const body = LockBodySchema.parse(request.body);

    const allowed = await canAccessProfile(authUser.id, body.profile_id);
    if (!allowed) throw new AppError(403, 'forbidden', 'Cannot lock to this profile');

    await db.update(sessions).set({ locked_profile_id: body.profile_id }).where(eq(sessions.id, authUser.session_id));
    // "Lock phone" (block_apps) turns app blocking on here, not only through
    // the client's own profile write: a write pushed after this call meets a
    // locked session, and the sync lock gate refuses `profiles`. A plain lock
    // (pinning the app) leaves blocking as it is.
    if (body.block_apps) await setChildModeActive(body.profile_id, true);
    return { locked_profile_id: body.profile_id };
  });

  /** S24 unlock overlay: clears this session's lock, but only once the PIN checks out server-side. */
  app.post('/me/unlock', { preHandler: requireUser }, async (request): Promise<{ locked_profile_id: null }> => {
    const authUser = request.user!;
    const body = PinBodySchema.parse(request.body);

    const [userRow] = await db.select({ pin_hash: users.pin_hash }).from(users).where(eq(users.id, authUser.id)).limit(1);
    if (!userRow?.pin_hash || !(await verifyPin(body.pin, userRow.pin_hash))) {
      throw new AppError(401, 'invalid_pin', 'Wrong PIN');
    }

    const [session] = await db.select({ locked_profile_id: sessions.locked_profile_id }).from(sessions).where(eq(sessions.id, authUser.session_id)).limit(1);
    await db.update(sessions).set({ locked_profile_id: null }).where(eq(sessions.id, authUser.session_id));
    await setChildModeActive(session?.locked_profile_id ?? null, false);
    return { locked_profile_id: null };
  });

  app.delete('/me', { preHandler: requireUser }, async (request, reply) => {
    const authUser = request.user;
    if (!authUser) throw new AppError(401, 'unauthorized', 'Sign-in required');
    const userId = authUser.id;

    await db.transaction(async (tx) => {
      /** Deletes an account and everything under it: profiles, every profile-scoped row, invites, media. */
      async function deleteAccountCascade(accountId: string): Promise<void> {
        const profileIds = (
          await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId))
        ).map((r) => r.id);

        if (profileIds.length > 0) {
          await tx.delete(step_completions).where(inArray(step_completions.profile_id, profileIds));
          await tx.delete(chip_ledger).where(inArray(chip_ledger.profile_id, profileIds));
          await tx.delete(attitude_checks).where(inArray(attitude_checks.profile_id, profileIds));
          await tx.delete(schedule_items).where(inArray(schedule_items.profile_id, profileIds));
          await tx.delete(recurrence_skips).where(inArray(recurrence_skips.profile_id, profileIds));
          await tx.delete(activity_steps).where(inArray(activity_steps.profile_id, profileIds));
          await tx.delete(activities).where(inArray(activities.profile_id, profileIds));
          await tx.delete(story_pages).where(inArray(story_pages.profile_id, profileIds));
          await tx.delete(social_stories).where(inArray(social_stories.profile_id, profileIds));
          await tx.delete(rewards).where(inArray(rewards.profile_id, profileIds));
          await tx.delete(locations).where(inArray(locations.profile_id, profileIds));
          await tx.delete(profile_members).where(inArray(profile_members.profile_id, profileIds));
        }
        await tx.delete(profiles).where(eq(profiles.account_id, accountId));
        await tx.delete(invites).where(eq(invites.account_id, accountId));
        await tx.delete(media).where(eq(media.account_id, accountId));
        await tx.delete(account_members).where(eq(account_members.account_id, accountId));
        await tx.delete(accounts).where(eq(accounts.id, accountId));
      }

      const memberships = await tx.select().from(account_members).where(eq(account_members.user_id, userId));

      for (const membership of memberships) {
        const accountId = membership.account_id;
        const allMembers = await tx.select().from(account_members).where(eq(account_members.account_id, accountId));

        if (allMembers.length === 1) {
          await deleteAccountCascade(accountId);
          continue;
        }

        if (membership.role === 'admin') {
          const otherAdmin = allMembers.some((m) => m.user_id !== userId && m.role === 'admin');
          if (!otherAdmin) {
            throw new AppError(409, 'last_admin', 'Promote another member to admin before deleting your account');
          }
        }

        // Other people still use this account: just leave it, don't touch its data.
        // ponytail: unlike DELETE /accounts/:id/members/:user_id, this doesn't reassign
        // updated_by/created_by rows to another member; nothing reads those back against
        // `users`, and the account isn't this user's to keep tidy for others on their way out.
        const profileIds = (
          await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.account_id, accountId))
        ).map((r) => r.id);
        if (profileIds.length > 0) {
          await tx
            .delete(profile_members)
            .where(and(eq(profile_members.user_id, userId), inArray(profile_members.profile_id, profileIds)));
        }
        await tx
          .delete(account_members)
          .where(and(eq(account_members.account_id, accountId), eq(account_members.user_id, userId)));
      }

      await tx
        .update(sessions)
        .set({ revoked_at: Date.now() })
        .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)));
      await tx.delete(users).where(eq(users.id, userId));
    });

    return reply.code(204).send();
  });
}
