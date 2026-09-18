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

// `useLiveQuery` returns `undefined` for BOTH "still loading" and "resolved,
// no such row". `useKv` collapses that into `fallback` either way, which is
// fine for values but wrong for a redirect gate (ChildShell.tsx redirecting
// off /child/ on the loading tick, before the real row arrives). Wrapping
// the resolved value keeps it distinguishable from useLiveQuery's own
// pending-state `undefined`.
const KV_LOADING = Symbol('kv-loading');

/** True once the live query for `key` has resolved, whether or not a row exists. */
export function useKvLoaded(key: string): boolean {
  const row = useLiveQuery(() => db.kv.get(key), [key], KV_LOADING);
  return row !== KV_LOADING;
}
