'use client';

import { useSyncExternalStore } from 'react';
import { SYNCED_TABLES, SyncPullResponseSchema, SyncPushResponseSchema } from '@chipperly/shared/schemas/sync';
import type { Mutation, SyncPullResponse, SyncPushResponse } from '@chipperly/shared/schemas/sync';
import type { SyncedTable } from '@chipperly/shared/constants/tables';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db, tableFor, type SyncedRow } from '../db/db';
import { api, ApiError } from '../api/client';
import { now } from '../clock';
import { uploadPending } from '../media/upload';
import { clearSession } from '../auth/session';
import { applyPulledRow } from './applyPulledRow';
import { mutationProfileId } from './mutationProfileId';
import { flushRewardRequests } from '../data/rewardRequest';
import { flushFirstThenProgress } from '../data/firstThen';

export { applyPulledRow };

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  last_synced_at: number | null;
}

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 500;
const POLL_MS = 60_000;

let status: SyncStatus = { state: 'offline', pending: 0, last_synced_at: null };
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
  if (running) return;
  running = true;
  backoffMs = 0;
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
    await inTurn(async () => {
      await pushOutbox();
      const profiles = await db.profiles.toArray();
      for (const profile of profiles) {
        await pullProfileNow(profile.id);
      }
    });
    await uploadPending();
    await flushRewardRequests();
    await flushFirstThenProgress();
    backoffMs = 0;
    if (rerunAfterCycle) scheduleCycle();
    const pending = await db.outbox.count();
    setStatus({ state: pending > 0 ? 'pending' : 'synced', pending, last_synced_at: now() });
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
      { schema: SyncPullResponseSchema },
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

/** Outbox seqs a push settled: the ones it sent for this row, not one written while it was in flight. */
export function settledSeqs(entries: readonly { seq?: number }[], pushedSeq: number | undefined): number[] {
  if (pushedSeq === undefined) return [];
  return entries.flatMap((e) => (e.seq !== undefined && e.seq <= pushedSeq ? [e.seq] : []));
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

async function pushOutbox(): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray();
  if (entries.length === 0) return;

  // Collapse to the latest pending write per id: only the final state and
  // its timestamp matter to the server's LWW check.
  const latestById = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) latestById.set(entry.id, entry);

  const byProfile = new Map<string, Mutation[]>();
  for (const entry of latestById.values()) {
    const profileId = mutationProfileId(entry.table, entry.id, entry.row);
    if (!profileId) continue;
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

  for (const [profileId, mutations] of byProfile) {
    const res = await api.post<SyncPushResponse>(
      '/sync/push',
      { profile_id: profileId, mutations },
      { schema: SyncPushResponseSchema },
    );

    for (const id of res.applied) {
      await settleOutbox(id, latestById.get(id)?.seq);
    }
    for (const rejected of res.rejected) {
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
}
