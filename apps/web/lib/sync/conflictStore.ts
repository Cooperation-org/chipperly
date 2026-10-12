import type { MutationTable } from '@chipperly/shared/constants/tables';
import { db, tableForMutation, type ConflictEntry } from '../db/db';
import { now } from '../clock';
import { isConflict } from './conflict';
import { nextClientUpdatedAt } from './nextClientUpdatedAt';

// Where a row goes when this device and the account changed it differently.
// This device's copy stays in its table and the account's copy waits here for
// a choice. Nothing is overwritten and nothing is sent for the row until then.

type Row = Record<string, unknown>;

/**
 * Called where sync is about to put the account's copy over a row of this
 * device. Returns true when it set the copy aside instead: the caller must
 * then leave the local row alone. `holdsUnsentChange` is true while the row
 * has a queued write, or an unanswered conflict already.
 */
export async function setAsideIfConflict(table: MutationTable, local: Row | undefined, incoming: Row, holdsUnsentChange: boolean): Promise<boolean> {
  const alreadyAsked = local ? (await db.sync_conflicts.get(local.id as string)) !== undefined : false;
  if (!isConflict(local, incoming, holdsUnsentChange || alreadyAsked)) return false;
  const id = incoming.id as string;
  // The queued or parked write is this conflict now; it goes back in the outbox only if "keep mine" is chosen.
  await db.outbox.where('id').equals(id).delete();
  await db.outbox_parked.where('id').equals(id).delete();
  await db.sync_conflicts.put({ id, table, mine: local as Row, theirs: incoming, found_at: now() });
  return true;
}

export function listConflicts(): Promise<ConflictEntry[]> {
  return db.sync_conflicts.orderBy('id').toArray();
}

export function countConflicts(): Promise<number> {
  return db.sync_conflicts.count();
}

/** Keep this device's copy: it is written again, stamped after the account's so the account takes it. */
async function keepMine(entry: ConflictEntry): Promise<void> {
  const tbl = tableForMutation(entry.table);
  const client_updated_at = nextClientUpdatedAt(now(), entry.theirs.client_updated_at as number);
  const row: Row = { ...entry.mine, client_updated_at };
  await tbl.put(row as never);
  await db.outbox.add({
    id: entry.id,
    table: entry.table,
    op: row.deleted_at === null || row.deleted_at === undefined ? 'upsert' : 'delete',
    row,
    client_updated_at,
    attempts: 0,
    created_at: now(),
  });
}

/** Take the account's copy: this device's change is given up. */
async function takeTheirs(entry: ConflictEntry): Promise<void> {
  await tableForMutation(entry.table).put(entry.theirs as never);
}

export async function resolveConflicts(ids: readonly string[], choice: 'mine' | 'theirs'): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const id of ids) {
      const entry = await db.sync_conflicts.get(id);
      if (!entry) continue;
      await (choice === 'mine' ? keepMine(entry) : takeTheirs(entry));
      await db.sync_conflicts.delete(id);
    }
  });
}
