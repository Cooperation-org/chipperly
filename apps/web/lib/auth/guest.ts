import { db } from '../db/db';

/** When the guest session began (ms). Its presence in kv is what makes this device a guest device. */
export const GUEST_STARTED_AT_KEY = 'guest_started_at';
export const GUEST_IDS_KEY = 'guest_ids';
/** Left behind when a trial ran out and was erased, so the sign-in page can say what happened. Gone at the next sign-in or trial. */
export const GUEST_EXPIRED_NOTICE_KEY = 'guest_expired_notice';
export const GUEST_MESSAGE = 'Create a free account to use this.';

export interface GuestIds {
  user_id: string;
  account_id: string;
  profile_id: string;
}

/** Set by session.ts on bootstrap/start/end; sync so api calls and writes can check it without a kv read. */
let guestMode = false;

export function isGuestMode(): boolean {
  return guestMode;
}

export function setGuestMode(on: boolean): void {
  guestMode = on;
}

/** Device-wide kv entries that outlive a wipe (the device's identity and its sound/motion settings). */
const KEEP_KV_KEYS = ['device_id', 'device_settings'];

/** Empties every table, kv included, except the device-wide entries above. */
export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const keep = (await db.kv.bulkGet(KEEP_KV_KEYS)).filter((row) => row !== undefined);
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.kv.bulkPut(keep);
  });
}
