/**
 * Whether to keep `local` or take `incoming` for one pulled row
 * (technical-plan.md section 6 "Pull"): replace unless the local row is
 * newer AND still has a pending outbox entry (an unsynced local edit).
 *
 * A pure function on purpose, split out of engine.ts, so it can be unit
 * tested without constructing the Dexie database (which needs indexedDB).
 */
export function applyPulledRow<T extends { client_updated_at: number }>(
  local: T | undefined,
  incoming: T,
  hasOutbox: boolean,
): T {
  if (!local) return incoming;
  const shouldReplace = incoming.client_updated_at >= local.client_updated_at || !hasOutbox;
  return shouldReplace ? incoming : local;
}

/**
 * Whether to keep `local` or take `incoming` for a row that arrived in a
 * snapshot response rather than a sync pull (today: the profiles in `/me`,
 * lib/auth/session.ts). A snapshot is fetched on every boot and can land
 * after a newer local edit has already been written and pushed, so the only
 * safe rule is never to move a row backwards in time: take incoming unless
 * the local row is strictly newer.
 *
 * This is deliberately stricter than `applyPulledRow`, which also replaces a
 * newer local row once its outbox entry is gone: a pull is ordered against
 * the server's version cursor, a snapshot is not ordered against anything.
 */
export function applySnapshotRow<T extends { client_updated_at: number }>(local: T | undefined, incoming: T): T {
  if (!local) return incoming;
  return incoming.client_updated_at >= local.client_updated_at ? incoming : local;
}
