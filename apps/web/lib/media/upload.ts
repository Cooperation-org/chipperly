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
    form.append('file', item.blob, item.media_id);

    const res = await fetch(`${apiBase}/media`, { method: 'POST', headers, body: form });
    if (!res.ok) continue;

    await db.media_blobs.update(item.media_id, { uploaded: 1 });
  }
}
