// Pure decisions about a row changed on this device and on the account, split
// out so they are testable without IndexedDB.

/** Bookkeeping that differs between any two copies of a row and says nothing about its content. */
const BOOKKEEPING = new Set(['version', 'client_updated_at', 'updated_by']);

type Row = Record<string, unknown>;

/** The content fields (deleted_at included: a delete is a change) whose values differ. */
export function changedFields(mine: Row, theirs: Row): string[] {
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  return [...keys].filter((key) => !BOOKKEEPING.has(key) && JSON.stringify(mine[key] ?? null) !== JSON.stringify(theirs[key] ?? null));
}

/**
 * Sync would replace an unsent change of this device with the account's copy,
 * and the two really disagree. Not a conflict: a row only the account has
 * (an addition), a copy that says the same thing, or no unsent change here
 * (the account's copy is then just the newer state).
 */
export function isConflict(local: Row | undefined, incoming: Row, holdsUnsentChange: boolean): boolean {
  if (!local || !holdsUnsentChange) return false;
  return changedFields(local, incoming).length > 0;
}
