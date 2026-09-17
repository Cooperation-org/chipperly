import type { MutationTable } from '@chipperly/shared/constants/tables';
import { db, tableForMutation, type MutationRow } from '../db/db';
import { getKv } from '../db/kv';
import { now } from '../clock';

const CURRENT_USER_KEY = 'current_user_id';

async function currentUserId(): Promise<string> {
  const id = await getKv<string>(CURRENT_USER_KEY);
  if (!id) throw new Error('mutate: no signed-in user');
  return id;
}

/**
 * Writes the row to its Dexie table and appends the matching outbox entry
 * in one transaction (technical-plan.md section 6 "Client loop"). `version`
 * is left as the caller set it: 0 for a new local row, unchanged for an edit
 * of a row that already synced.
 */
export async function upsert<T extends MutationTable>(table: T, row: MutationRow<T>): Promise<void> {
  const updated_by = await currentUserId();
  const client_updated_at = now();
  const nextRow = { ...row, client_updated_at, updated_by } as MutationRow<T>;
  const tbl = tableForMutation(table);

  await db.transaction('rw', tbl, db.outbox, async () => {
    await tbl.put(nextRow);
    await db.outbox.add({
      id: nextRow.id,
      table,
      op: 'upsert',
      row: nextRow as unknown as Record<string, unknown>,
      client_updated_at,
      attempts: 0,
      created_at: now(),
    });
  });
}

export async function softDelete(table: MutationTable, id: string): Promise<void> {
  const updated_by = await currentUserId();
  const client_updated_at = now();
  const tbl = tableForMutation(table);

  await db.transaction('rw', tbl, db.outbox, async () => {
    const existing = await tbl.get(id);
    if (!existing) return;
    const nextRow = { ...existing, deleted_at: client_updated_at, client_updated_at, updated_by };
    await tbl.put(nextRow);
    // `row` is kept locally (dropped from the wire payload by the push loop,
    // which the server contract treats as optional for deletes) so the sync
    // engine can read `profile_id` off a delete entry without a table lookup.
    await db.outbox.add({
      id,
      table,
      op: 'delete',
      row: nextRow as unknown as Record<string, unknown>,
      client_updated_at,
      attempts: 0,
      created_at: now(),
    });
  });
}

export async function restore(table: MutationTable, id: string): Promise<void> {
  const updated_by = await currentUserId();
  const client_updated_at = now();
  const tbl = tableForMutation(table);

  await db.transaction('rw', tbl, db.outbox, async () => {
    const existing = await tbl.get(id);
    if (!existing) return;
    const nextRow = { ...existing, deleted_at: null, client_updated_at, updated_by };
    await tbl.put(nextRow);
    await db.outbox.add({
      id,
      table,
      op: 'upsert',
      row: nextRow as unknown as Record<string, unknown>,
      client_updated_at,
      attempts: 0,
      created_at: now(),
    });
  });
}
