'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

/** Device settings, active profile/account, tokens, lock state — all live here (CONTRACTS.md `lib/db/db.ts`). */
export async function getKv<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function setKv<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}

/** Live-updating read of a kv entry; `fallback` while loading or unset. */
export function useKv<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.kv.get(key), [key]);
  return row === undefined ? fallback : (row.value as T);
}
