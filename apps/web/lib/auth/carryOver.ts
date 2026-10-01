'use client';

import { useSyncExternalStore } from 'react';
import { SYNCED_TABLES } from '@chipperly/shared/schemas/sync';
import type { MeResponse } from '@chipperly/shared/schemas/auth';
import type { Account } from '@chipperly/shared/schemas/account';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { api } from '../api/client';
import { db, tableFor, type OutboxEntry } from '../db/db';
import { getKv, setKv } from '../db/kv';
import { now } from '../clock';
import { enterParentMode } from '../device/settings';
import { setDeviceRole } from '../device/role';
import { GUEST_IDS_KEY, GUEST_STARTED_AT_KEY } from './guest';
import { rekeyGuestWork, type CarryOver, type GuestRows } from './rekeyGuestWork';

/** Set when a guest taps "Create account": their work moves into the account that sign-up makes. */
export const CARRY_OVER_KEY = 'guest_carry_over';
/** 'saved' or 'discarded': a one-time toast, shown by components/auth/CarryOverScreen.tsx and then removed. */
export const CARRY_NOTICE_KEY = 'carry_over_notice';
/** Kept in step with components/shell/GuestBanner.tsx. */
export const GUEST_BANNER_DISMISSED_KEY = 'guest_banner_dismissed';
export const GUEST_KV_KEYS = [CARRY_OVER_KEY, GUEST_IDS_KEY, GUEST_STARTED_AT_KEY, GUEST_BANNER_DISMISSED_KEY];

/** idle: nothing going on. saving: the work is being moved (sync waits). failed: stopped; the work is still on the device. */
export type CarryOverPhase = 'idle' | 'saving' | 'failed';

let phase: CarryOverPhase = 'idle';
const listeners = new Set<() => void>();

export function setCarryOverPhase(next: CarryOverPhase): void {
  phase = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCarryOverPhase(): CarryOverPhase {
  return useSyncExternalStore(subscribe, () => phase, () => 'idle' as const);
}

interface CreateAccountResponse {
  account: Account;
}

let inFlight: Promise<boolean> | null = null;

/**
 * Moves the guest's work into the signed-in user's account. Resumable and safe to repeat: the server
 * is asked what it already has (`me`) before anything is created, and nothing local is removed until
 * one Dexie transaction has queued the rows for sync. True when done; false when it stopped and the
 * work is still on the device (phase 'failed').
 */
export function runCarryOver(me: MeResponse): Promise<boolean> {
  inFlight ??= carry(me).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function carry(me: MeResponse): Promise<boolean> {
  setCarryOverPhase('saving');
  try {
    const flag = await getKv<CarryOver>(CARRY_OVER_KEY);
    const guestProfile = flag ? await db.profiles.get(flag.guest.profile_id) : undefined;
    if (!flag || !guestProfile) {
      await db.kv.bulkDelete(GUEST_KV_KEYS);
      setCarryOverPhase('idle');
      return true;
    }

    // `me` is from this sign-in, so an account or profile in it is one an earlier attempt made (canCarryOver).
    let accountId = flag.account_id ?? me.accounts[0]?.account.id;
    if (!accountId) {
      const res = await api.post<CreateAccountResponse>('/accounts', { kind: 'household', name: me.user.display_name });
      accountId = res.account.id;
    }
    if (flag.account_id !== accountId) await setKv<CarryOver>(CARRY_OVER_KEY, { ...flag, account_id: accountId });

    const serverProfile =
      me.profiles.find((p) => p.account_id === accountId) ??
      (await api.post<Profile>(`/accounts/${accountId}/profiles`, {
        name: guestProfile.name,
        emoji: guestProfile.avatar_emoji,
        ...(guestProfile.settings.child_uses_app === false ? { child_uses_app: false } : {}),
        skip_seed: true,
      }));

    const rows: GuestRows = {};
    for (const table of SYNCED_TABLES) {
      (rows as Record<string, unknown[]>)[table] = await tableFor(table).where('profile_id').equals(guestProfile.id).toArray();
    }
    const work = rekeyGuestWork(guestProfile, rows, { serverProfile, userId: me.user.id, now: now() });

    await db.transaction('rw', db.tables, async () => {
      const queue = (table: OutboxEntry['table'], row: { id: string; client_updated_at: number }): Promise<unknown> =>
        db.outbox.add({
          id: row.id,
          table,
          op: 'upsert',
          row: row as unknown as Record<string, unknown>,
          client_updated_at: row.client_updated_at,
          attempts: 0,
          created_at: now(),
        });
      await db.profiles.delete(guestProfile.id);
      await db.profiles.put(work.profile);
      await queue('profiles', work.profile);
      for (const { table, row } of work.rows) {
        await tableFor(table).put(row as never);
        await queue(table, row);
      }
      await db.users.delete(flag.guest.user_id);
      await db.accounts.delete(flag.guest.account_id);
      await db.kv.bulkDelete(GUEST_KV_KEYS);
      await db.kv.bulkPut([
        { key: 'active_account_id', value: accountId },
        { key: 'active_profile_id', value: work.profile.id },
        { key: CARRY_NOTICE_KEY, value: 'saved' },
      ]);
    });
    // Same as Ready's "Go to Today": the caregiver who just built this is about to keep editing it.
    await setDeviceRole({ kind: 'caregiver' });
    await enterParentMode();
    setCarryOverPhase('idle');
    return true;
  } catch {
    setCarryOverPhase('failed');
    return false;
  }
}
