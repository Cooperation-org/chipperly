import type { ClientRejection } from '@chipperly/shared/schemas/syncHealth';
import type { ParkedKind } from '@chipperly/shared/schemas/syncHealth';
import { db, type OutboxEntry, type ParkedEntry } from '../db/db';
import { getKv } from '../db/kv';
import { now } from '../clock';
import { mutationProfileId } from './mutationProfileId';
import { settledSeqs } from './settledSeqs';

// Where a write goes when the server will not take it: out of the outbox
// (so it stops blocking or being re-sent every minute) and into
// outbox_parked, where it is kept, counted, reported and can be sent again.
// Only IndexedDB and kv are touched here, so lib/auth/session.ts can use it
// without pulling in the sync engine.

/** Same key lib/auth/session.ts writes; read here to stamp who made a write. */
const CURRENT_USER_KEY = 'current_user_id';

async function currentUserId(): Promise<string | null> {
  return (await getKv<string>(CURRENT_USER_KEY)) ?? null;
}

/** This person's parked writes, and the ones nobody is known to own. */
function visibleTo(userId: string | null): (entry: ParkedEntry) => boolean {
  return (entry) => entry.owner === null || entry.owner === userId;
}

/**
 * Moves the write a push just failed to land out of the outbox and keeps it.
 * `entry` is the outbox entry that was sent. A newer write for the same row
 * made while the push was in flight stays queued and replaces this one: it
 * carries the row's latest state.
 */
export async function parkEntry(entry: OutboxEntry, reason: string, kind: ParkedKind, reported: boolean): Promise<void> {
  const owner = await currentUserId();
  await db.transaction('rw', db.outbox, db.outbox_parked, async () => {
    const queued = await db.outbox.where('id').equals(entry.id).toArray();
    const settled = settledSeqs(queued, entry.seq);
    await db.outbox.bulkDelete(settled);
    if (queued.length > settled.length) return;
    await db.outbox_parked.where('id').equals(entry.id).delete();
    await db.outbox_parked.add({
      id: entry.id,
      table: entry.table,
      op: entry.op,
      row: entry.row,
      client_updated_at: entry.client_updated_at,
      created_at: entry.created_at,
      reason,
      kind,
      parked_at: now(),
      owner,
      reported: reported ? 1 : 0,
    });
  });
}

/** The server has this row now: whatever was parked for it is settled. */
export async function clearParked(id: string): Promise<void> {
  await db.outbox_parked.where('id').equals(id).delete();
}

/**
 * Puts parked writes of the given kinds back in the outbox to be sent again.
 * Only this person's. A row that has a newer write queued already is simply
 * dropped from the parked list. Returns how many went back.
 */
export async function retryParked(kinds: readonly ParkedKind[]): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  return db.transaction('rw', db.outbox, db.outbox_parked, async () => {
    const entries = (await db.outbox_parked.where('kind').anyOf([...kinds]).toArray()).filter((entry) => entry.owner === userId || (entry.owner === null && entry.reason !== 'signed_out'));
    let moved = 0;
    for (const entry of entries) {
      const alreadyQueued = (await db.outbox.where('id').equals(entry.id).count()) > 0;
      if (!alreadyQueued) {
        await db.outbox.add({
          id: entry.id,
          table: entry.table,
          op: entry.op,
          row: entry.row,
          client_updated_at: entry.client_updated_at,
          attempts: 0,
          created_at: entry.created_at,
        });
        moved += 1;
      }
      if (entry.seq !== undefined) await db.outbox_parked.delete(entry.seq);
    }
    return moved;
  });
}

/**
 * A different person is about to sign in on this device and the previous
 * person's rows are about to be cleared. Their unsent writes are set aside
 * under their name instead of being thrown away with the rest, and go back
 * in the outbox when they sign in here again (retryParked).
 */
export async function setAsideOutbox(owner: string | null): Promise<number> {
  return db.transaction('rw', db.outbox, db.outbox_parked, async () => {
    const queued = await db.outbox.orderBy('seq').toArray();
    const latestById = new Map<string, OutboxEntry>();
    for (const entry of queued) latestById.set(entry.id, entry);
    for (const entry of latestById.values()) {
      await db.outbox_parked.where('id').equals(entry.id).delete();
      await db.outbox_parked.add({
        id: entry.id,
        table: entry.table,
        op: entry.op,
        row: entry.row,
        client_updated_at: entry.client_updated_at,
        created_at: entry.created_at,
        reason: 'signed_out',
        kind: 'held',
        parked_at: now(),
        owner,
        reported: 0,
      });
    }
    await db.outbox.clear();
    return latestById.size;
  });
}

export interface ParkedCounts {
  held: number;
  dead: number;
}

/** What the signed-in person has parked here. */
export async function parkedCounts(): Promise<ParkedCounts> {
  const userId = await currentUserId();
  const mine = (await db.outbox_parked.toArray()).filter(visibleTo(userId));
  return { held: mine.filter((e) => e.kind === 'held').length, dead: mine.filter((e) => e.kind === 'dead').length };
}

/** Everything on this device the signed-in person's account does not have: queued and parked. */
export async function unsavedEntries(): Promise<{ queued: OutboxEntry[]; parked: ParkedEntry[] }> {
  const userId = await currentUserId();
  return { queued: await db.outbox.orderBy('seq').toArray(), parked: (await db.outbox_parked.toArray()).filter(visibleTo(userId)) };
}

/**
 * Parked writes the server has not heard about, shaped for POST
 * /sync/rejections. One that belongs to somebody else goes without its row:
 * the server learns that it exists, not what it says.
 */
export async function unreportedParked(): Promise<{ seqs: number[]; items: ClientRejection[] }> {
  const userId = await currentUserId();
  const entries = (await db.outbox_parked.toArray()).filter((entry) => entry.reported === 0).slice(0, 200);
  const mine = visibleTo(userId);
  return {
    seqs: entries.flatMap((entry) => (entry.seq === undefined ? [] : [entry.seq])),
    items: entries.map((entry) => ({
      table: entry.table,
      id: entry.id,
      op: entry.op,
      reason: mine(entry) ? entry.reason : 'left_on_device',
      client_updated_at: entry.client_updated_at,
      profile_id: mutationProfileId(entry.table, entry.id, entry.row) ?? null,
      ...(mine(entry) && entry.op === 'upsert' && entry.row ? { row: entry.row } : {}),
    })),
  };
}

export async function markReported(seqs: readonly number[]): Promise<void> {
  await db.outbox_parked.where('seq').anyOf([...seqs]).modify({ reported: 1 });
}
