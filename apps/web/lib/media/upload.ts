import { db } from '../db/db';
import { apiBase } from '../api/base';
import { getTokens } from '../api/client';
import { getKv } from '../db/kv';

/**
 * Posts every not-yet-uploaded local media blob to `/media` and marks it
 * uploaded. Called by the sync engine after a successful push, while
 * online. A failed upload is left `uploaded: 0` and retried next cycle.
 */
export async function uploadPending(): Promise<void> {
  const pending = await db.media_blobs.filter((row) => row.uploaded === 0).toArray();
  if (pending.length === 0) return;

  const tokens = await getTokens();
  if (!tokens?.access_token) return;
  const accountId = await getKv<string>('active_account_id');

  const headers: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
  if (accountId) headers['X-Account-Id'] = accountId;

  for (const item of pending) {
    const form = new FormData();
    form.append('media_id', item.media_id);
    form.append('file', new Blob([item.bytes], { type: item.type }), item.media_id);

    const res = await fetch(`${apiBase}/media`, { method: 'POST', headers, body: form });
    if (!res.ok) continue;

    if (process.env.NODE_ENV === 'development') {
      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      if (body?.id && body.id !== item.media_id) {
        // ponytail: older API without the media_id fix mints its own id, which the synced
        // rows referencing item.media_id will never resolve. Server now honours the id we
        // send, so this should stay unreachable; upgrade path is reconciling referencing
        // rows if it ever fires.
        console.error(`uploadPending: server returned id ${body.id} for uploaded media_id ${item.media_id}`);
      }
    }

    await db.media_blobs.update(item.media_id, { uploaded: 1 });
  }
}
