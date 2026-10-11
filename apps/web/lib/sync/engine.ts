'use client';

import { useSyncExternalStore } from 'react';
import { SYNCED_TABLES, SyncPullResponseSchema, SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import type { Mutation, SyncPullResponse, SyncPushResponse } from '@chipperly/shared/schemas/sync';
import type { SyncedTable } from '@chipperly/shared/constants/tables';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db, tableFor, type OutboxEntry, type SyncedRow } from '../db/db';
import { api, ApiError } from '../api/client';
import { now } from '../clock';
import { uploadPending } from '../media/upload';
import { clearSession } from '../auth/session';
import { isGuestMode } from '../auth/guest';
import { applyPulledRow } from './applyPulledRow';
import { mutationProfileId } from './mutationProfileId';
import { flushRewardRequests } from '../data/rewardRequest';
import { flushFirstThenProgress } from '../data/firstThen';
import { getDeviceId } from '../device/identity';
import { isPermanentHttpFailure, rejectionOutcome, shouldReportHealth } from './parked';
import { clearParked, markReported, parkEntry, parkedCounts, retryParked, unreportedParked } from './parkedStore';
import { settledSeqs } from './settledSeqs';

export { applyPulledRow, settledSeqs };

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  last_synced_at: number | null;
  /** When the oldest queued write was made; null with nothing queued. */
  oldest_pending_at: number | null;
  /** Writes the server refused for now and that will be sent again (lib/sync/parkedStore.ts). */
  held: number;
  /** Writes the server will not take as they are. Kept on this device until someone acts. */
  dead: number;
}

/** A big batch on a slow phone connection needs longer than the 20s a normal request gets. */
const SYNC_TIMEOUT_MS = 60_000;

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 500;
const POLL_MS = 60_000;

let status: SyncStatus = { state: 'offline', pending: 0, last_synced_at: null, oldest_pending_at: null, held: 0, dead: 0 };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

let running = false;
let cycleRunning = false;
/** A cycle was asked for while one ran (e.g. an edit made mid-push); run again right after instead of waiting for the poll. */
let rerunAfterCycle = false;
let backoffMs = 0;
let intervalHandle: ReturnType<typeof setInterval> | undefined;
let debounceHandle: ReturnType<typeof setTimeout> | undefined;
/** Rows this device holds that the server never confirmed are re-queued once per session (requeueUnsynced). */
let reconciled = false;
let lastHeldRetryAt = 0;
/** Held writes are offered to the server again this often, and at once after an unlock (retryHeldNow). */
const HELD_RETRY_MS = 30 * 60 * 1000;
let lastHealthSignature: string | null = null;
let lastHealthSentAt = 0;

function scheduleCycle(): void {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => void runCycle(), DEBOUNCE_MS);
}

function handleOnline(): void {
  void runCycle();
}

function handleOffline(): void {
  setStatus({ state: 'offline' });
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') void runCycle();
}

export function startSync(): void {
  if (running || isGuestMode()) return;
  running = true;
  backoffMs = 0;
  reconciled = false;
  lastHeldRetryAt = 0;
  // Ask the browser not to evict this site's storage: unsent writes live only there.
  if (typeof navigator !== 'undefined') void navigator.storage?.persist?.().catch(() => false);
  setStatus({ state: typeof navigator !== 'undefined' && navigator.onLine ? 'pending' : 'offline' });

  db.outbox.hook.creating.subscribe(scheduleCycle);
  // A profile created after this session's first cycle already ran (S3/S4
  // onboarding: the account exists and startSync() started before the
  // profile does) would otherwise sit unpulled until the 60s poll — its
  // seed data pulls only once db.profiles has a row for it.
  db.profiles.hook.creating.subscribe(scheduleCycle);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  intervalHandle = setInterval(() => void runCycle(), POLL_MS);

  void runCycle();
}

export function stopSync(): void {
  running = false;
  if (intervalHandle) clearInterval(intervalHandle);
  if (debounceHandle) clearTimeout(debounceHandle);
  intervalHandle = undefined;
  debounceHandle = undefined;
  db.outbox.hook.creating.unsubscribe(scheduleCycle);
  db.profiles.hook.creating.unsubscribe(scheduleCycle);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibility);
}

export async function syncNow(): Promise<void> {
  await runCycle();
}

/**
 * "Try again" from the sync sheet: everything parked, dead ones included,
 * goes back in the outbox and is sent, and local rows are checked against
 * the server once more.
 */
export async function retryUnsaved(): Promise<void> {
  await retryParked(['held', 'dead']);
  reconciled = false;
  await runCycle();
}

/** After an unlock: what the lock made the server refuse is sent again straight away. */
export async function retryHeldNow(): Promise<void> {
  lastHeldRetryAt = 0;
  await runCycle();
}

/**
 * Pushes and pulls take turns. A pull that overlapped a push could fetch a
 * row from before the push landed and apply it after the push had cleared
 * that row's outbox entry, silently undoing the change (a redeem's
 * working-for clear, a profile setting). materializeRecurringFresh pulls
 * outside runCycle, so the cycle guard alone didn't prevent it.
 */
let syncQueue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = syncQueue.then(work, work);
  syncQueue = run.catch(() => undefined);
  return run;
}

/**
 * Pushes whatever is queued right now and waits for it, in turn with any
 * cycle already running (syncNow returns at once when one is). For a step
 * that must not overtake local edits: locking (lib/device/lock.ts), after
 * which the server refuses a device's profile writes.
 */
export function flushOutbox(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
  return inTurn(() => pushOutbox());
}

async function runCycle(): Promise<void> {
  if (!running) return;
  if (cycleRunning) {
    rerunAfterCycle = true;
    return;
  }
  rerunAfterCycle = false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  cycleRunning = true;
  try {
    if (now() - lastHeldRetryAt > HELD_RETRY_MS) {
      lastHeldRetryAt = now();
      await retryParked(['held']);
    }
    await inTurn(async () => {
      await pushOutbox();
      const profiles = await db.profiles.toArray();
      for (const profile of profiles) {
        await pullProfileNow(profile.id);
      }
      // After a full push and pull every row the server has carries its
      // version. One that still has none, and nothing queued, never got there.
      if (!reconciled) {
        reconciled = true;
        await requeueUnsynced(profiles.map((profile) => profile.id));
      }
    });
    await uploadPending();
    await flushRewardRequests();
    await flushFirstThenProgress();
    backoffMs = 0;
    if (rerunAfterCycle) scheduleCycle();
    const counts = await refreshCounts();
    setStatus({ state: counts.pending > 0 ? 'pending' : 'synced', last_synced_at: now() });
    await reportToServer();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // client.ts already retried this request once via refresh token, so a
      // 401 here means the session is genuinely invalid, not transient.
      // Clear it (not just stopSync()) so the UI drops out of "signed in"
      // and RequireSession sends the caregiver to sign in again: otherwise
      // sync stays permanently wedged with no automatic or manual recovery.
      setStatus({ state: 'error' });
      stopSync();
      await clearSession();
      return;
    }
    // A fetch that never reached the server (TypeError, not an ApiError) is
    // the app being offline, which is a normal state here, not an error;
    // navigator.onLine stays true on wifi with no internet.
    setStatus({ state: err instanceof ApiError ? 'error' : 'offline' });
    await refreshCounts().catch(() => undefined);
    // The server answered, so it can at least be told what is waiting here.
    if (err instanceof ApiError) await reportToServer();
    backoffMs = backoffMs === 0 ? 5_000 : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => void runCycle(), backoffMs);
  } finally {
    cycleRunning = false;
  }
}

/** Also called directly by lib/data/schedule.ts's materializeRecurringFresh, ahead of materializing. */
export function pullProfile(profileId: string): Promise<void> {
  return inTurn(() => pullProfileNow(profileId));
}

async function pullProfileNow(profileId: string): Promise<void> {
  let cursor = (await db.sync_cursors.get(profileId))?.version ?? 0;
  let hasMore = true;
  while (hasMore) {
    const res = await api.get<SyncPullResponse>(
      `/sync/pull?profile_id=${encodeURIComponent(profileId)}&since=${cursor}`,
      { schema: SyncPullResponseSchema, timeoutMs: SYNC_TIMEOUT_MS },
    );
    await applyChanges(res.changes);
    cursor = res.version;
    hasMore = res.has_more;
    await db.sync_cursors.put({ profile_id: profileId, version: cursor });
  }
}

async function applyChanges(changes: Record<string, Record<string, unknown>[]>): Promise<void> {
  for (const table of SYNCED_TABLES) {
    const rows = changes[table];
    if (rows?.length) await applyRowsToTable(table, rows);
  }
  const profileRows = changes.profiles;
  if (profileRows?.length) {
    // Same hasOutbox-aware merge every SYNCED_TABLES row gets in
    // applyRowsToTable below, not a bare put: without it, a pull landing
    // between a local profile edit and its own push finishing can clobber
    // that unsynced edit with the older server row.
    for (const raw of profileRows) {
      const incoming = raw as unknown as Profile;
      const id = raw.id as string;
      const local = await db.profiles.get(id);
      const hasOutbox = (await db.outbox.where('id').equals(id).count()) > 0;
      await db.profiles.put(applyPulledRow(local, incoming, hasOutbox));
    }
  }
}

async function applyRowsToTable(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void> {
  const tbl = tableFor(table);
  const ids = rows.map((raw) => raw.id as string);

  await db.transaction('rw', tbl, db.outbox, async () => {
    const locals = await tbl.bulkGet(ids);
    const outboxIds = new Set((await db.outbox.where('id').anyOf(ids).toArray()).map((entry) => entry.id));
    const nextRows = rows.map((raw, i) => {
      const incoming = raw as unknown as SyncedRow<typeof table>;
      const hasOutbox = outboxIds.has(ids[i] as string);
      return applyPulledRow(locals[i], incoming, hasOutbox);
    });
    await tbl.bulkPut(nextRows);
  });
}

/**
 * Drops the outbox entries a push just settled for this row, and says
 * whether a newer one is left. Deleting every entry for the row lost an edit
 * made mid-push (a redeem clearing working-for, "Start over" saved): nothing
 * sent it, and the next pull put the server's older copy back.
 */
async function settleOutbox(id: string, pushedSeq: number | undefined): Promise<boolean> {
  const entries = await db.outbox.where('id').equals(id).toArray();
  const settled = settledSeqs(entries, pushedSeq);
  await db.outbox.bulkDelete(settled);
  return entries.length > settled.length;
}

type OutboxRow = OutboxEntry;

/**
 * An outbox entry leaves the outbox in exactly three ways: the server
 * applied it, the server had something newer and sent its row back (last
 * write wins), or it is moved to outbox_parked and kept (parkEntry). It is
 * never just deleted: that is how a phone locked to the child view lost
 * whole days.
 */
async function pushOutbox(): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray();
  if (entries.length === 0) return;

  // Collapse to the latest pending write per id: only the final state and
  // its timestamp matter to the server's LWW check.
  const latestById = new Map<string, OutboxRow>();
  for (const entry of entries) latestById.set(entry.id, entry);

  const byProfile = new Map<string, Mutation[]>();
  for (const entry of latestById.values()) {
    const profileId = mutationProfileId(entry.table, entry.id, entry.row);
    if (!profileId) {
      // Nothing can send this as it is. Kept and reported rather than left to sit in the outbox unseen.
      await parkEntry(entry, 'no_profile', 'dead', false);
      continue;
    }
    const mutation: Mutation = {
      table: entry.table,
      id: entry.id,
      op: entry.op,
      row: entry.op === 'upsert' ? entry.row : undefined,
      client_updated_at: entry.client_updated_at,
    };
    const list = byProfile.get(profileId) ?? [];
    list.push(mutation);
    byProfile.set(profileId, list);
  }

  const deviceId = await getDeviceId();
  for (const [profileId, mutations] of byProfile) {
    await pushProfile(profileId, mutations, latestById, deviceId);
  }
}

async function pushProfile(
  profileId: string,
  mutations: Mutation[],
  latestById: ReadonlyMap<string, OutboxRow>,
  deviceId: string,
): Promise<void> {
  let res: SyncPushResponse;
  try {
    res = await api.post<SyncPushResponse>(
      '/sync/push',
      { profile_id: profileId, mutations, device_id: deviceId },
      { schema: SyncPushResponseSchema, timeoutMs: SYNC_TIMEOUT_MS },
    );
  } catch (err) {
    // An answer that will not change on a retry. Sent one write at a time,
    // so a single bad write is found and set aside instead of blocking every
    // other write on this device for good.
    if (!(err instanceof ApiError) || !isPermanentHttpFailure(err.status)) throw err;
    if (mutations.length > 1) {
      for (const mutation of mutations) await pushProfile(profileId, [mutation], latestById, deviceId);
      return;
    }
    const entry = mutations[0] ? latestById.get(mutations[0].id) : undefined;
    if (entry) await parkEntry(entry, `http_${err.status}:${err.code}`, 'dead', false);
    return;
  }

  for (const id of res.applied) {
    await settleOutbox(id, latestById.get(id)?.seq);
    await clearParked(id);
  }
  for (const rejected of res.rejected) {
    const outcome = rejectionOutcome(rejected.reason);
    if (outcome !== 'server_wins') {
      // The server kept a copy of what it refused (routes/sync.ts), and so does this device.
      const entry = latestById.get(rejected.id);
      if (entry) await parkEntry(entry, rejected.reason, outcome, true);
      continue;
    }
    const newer = await settleOutbox(rejected.id, latestById.get(rejected.id)?.seq);
    // A change made during this push is still to send; the server's copy must not overwrite it.
    if (newer) continue;
    // `rejected.table` is a MutationTable (SyncedTable | 'profiles');
    // narrow explicitly so tableFor()'s SyncedTable-only signature holds.
    if (rejected.table === 'profiles') {
      if (rejected.server_row) await db.profiles.put(rejected.server_row as unknown as Profile);
    } else if (rejected.server_row) {
      await tableFor(rejected.table).put(rejected.server_row as SyncedRow<typeof rejected.table>);
    }
  }
  // No cursor move here: res.version is the server's latest version for
  // everyone, so advancing to it made the pull that follows skip other
  // devices' writes since this one's last pull, and any row the server
  // itself wrote during this push (a redeem's screen-time grant). The
  // pull re-fetching this device's own rows is harmless.
}

/**
 * Re-queues rows this device has and the server never confirmed. The server
 * stamps `version` on every row it stores and a pull brings that back, so a
 * live row still at version 0 with nothing queued or parked was dropped on
 * the way: by an older build that discarded refused writes, or by anything
 * else. Pushing it again is safe: the server keeps whichever copy is newer.
 */
async function requeueUnsynced(profileIds: readonly string[]): Promise<number> {
  if (profileIds.length === 0) return 0;
  let queued = 0;
  for (const table of SYNCED_TABLES) {
    const tbl = tableFor(table);
    const rows = (await tbl.where('profile_id').anyOf([...profileIds]).toArray()).filter((row) => row.version === 0 && row.deleted_at === null);
    if (rows.length === 0) continue;
    const ids = rows.map((row) => row.id);
    await db.transaction('rw', db.outbox, db.outbox_parked, async () => {
      const waiting = new Set([
        ...(await db.outbox.where('id').anyOf(ids).toArray()).map((entry) => entry.id),
        ...(await db.outbox_parked.where('id').anyOf(ids).toArray()).map((entry) => entry.id),
      ]);
      for (const row of rows) {
        if (waiting.has(row.id)) continue;
        await db.outbox.add({
          id: row.id,
          table,
          op: 'upsert',
          row: row as unknown as Record<string, unknown>,
          client_updated_at: row.client_updated_at,
          attempts: 0,
          created_at: row.client_updated_at,
        });
        queued += 1;
      }
    });
  }
  return queued;
}

/** Reads what is queued and parked into the status every screen subscribes to. */
async function refreshCounts(): Promise<{ pending: number }> {
  const pending = await db.outbox.count();
  const oldest = pending > 0 ? await db.outbox.orderBy('seq').first() : undefined;
  const parked = await parkedCounts();
  setStatus({ pending, oldest_pending_at: oldest?.created_at ?? null, held: parked.held, dead: parked.dead });
  return { pending };
}

/**
 * Tells the server what this device is still holding: any parked write it
 * has not heard of, and the counts. Best effort and never throws: the next
 * cycle says it again.
 */
async function reportToServer(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const unreported = await unreportedParked();
    if (unreported.items.length > 0) {
      await api.post('/sync/rejections', { device_id: deviceId, items: unreported.items });
      await markReported(unreported.seqs);
    }
    const signature = `${status.pending}|${status.held}|${status.dead}`;
    if (shouldReportHealth(signature, lastHealthSignature, lastHealthSentAt, now())) {
      await api.put('/me/sync-health', {
        device_id: deviceId,
        pending: status.pending,
        oldest_at: status.oldest_pending_at,
        held: status.held,
        dead: status.dead,
      });
      lastHealthSignature = signature;
      lastHealthSentAt = now();
    }
  } catch {
    // Offline or refused: nothing here is lost by not having said so yet.
  }
}
