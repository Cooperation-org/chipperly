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
