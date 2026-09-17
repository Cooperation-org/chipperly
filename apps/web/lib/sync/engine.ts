'use client';

import { useSyncExternalStore } from 'react';
import { SYNCED_TABLES } from '@chipperly/shared/schemas/sync';
import type { Mutation, SyncPullResponse, SyncPushResponse } from '@chipperly/shared/schemas/sync';
import type { SyncedTable } from '@chipperly/shared/constants/tables';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { db, tableFor, type SyncedRow } from '../db/db';
import { api, ApiError } from '../api/client';
import { now } from '../clock';
import { uploadPending } from '../media/upload';
import { applyPulledRow } from './applyPulledRow';
import { mutationProfileId } from './mutationProfileId';

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

async function runCycle(): Promise<void> {
  if (!running || cycleRunning) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  cycleRunning = true;
  try {
    await pushOutbox();
    const profiles = await db.profiles.toArray();
    for (const profile of profiles) {
      await pullProfile(profile.id);
    }
    await uploadPending();
    backoffMs = 0;
    const pending = await db.outbox.count();
    setStatus({ state: pending > 0 ? 'pending' : 'synced', pending, last_synced_at: now() });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Paused until the session refreshes and calls startSync() again.
      setStatus({ state: 'error' });
      stopSync();
      return;
    }
    setStatus({ state: 'error' });
    backoffMs = backoffMs === 0 ? 5_000 : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => void runCycle(), backoffMs);
  } finally {
    cycleRunning = false;
  }
}

async function pullProfile(profileId: string): Promise<void> {
  let cursor = (await db.sync_cursors.get(profileId))?.version ?? 0;
  let hasMore = true;
  while (hasMore) {
    const res = await api.get<SyncPullResponse>(
      `/sync/pull?profile_id=${encodeURIComponent(profileId)}&since=${cursor}`,
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
    await db.profiles.bulkPut(profileRows as unknown as Profile[]);
  }
}

async function applyRowsToTable(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void> {
  const tbl = tableFor(table);
  for (const raw of rows) {
    const incoming = raw as unknown as SyncedRow<typeof table>;
    const id = raw.id as string;
    const local = await tbl.get(id);
    const hasOutbox = (await db.outbox.where('id').equals(id).count()) > 0;
    const next = applyPulledRow(local, incoming, hasOutbox);
    await tbl.put(next);
  }
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
    const res = await api.post<SyncPushResponse>('/sync/push', { profile_id: profileId, mutations });

    for (const id of res.applied) {
      await db.outbox.where('id').equals(id).delete();
    }
    for (const rejected of res.rejected) {
      // `rejected.table` is a MutationTable (SyncedTable | 'profiles');
      // narrow explicitly so tableFor()'s SyncedTable-only signature holds.
      if (rejected.table === 'profiles') {
        if (rejected.server_row) await db.profiles.put(rejected.server_row as unknown as Profile);
      } else if (rejected.server_row) {
        await tableFor(rejected.table).put(rejected.server_row as SyncedRow<typeof rejected.table>);
      }
      await db.outbox.where('id').equals(rejected.id).delete();
    }
    await db.sync_cursors.put({ profile_id: profileId, version: res.version });
  }
}
