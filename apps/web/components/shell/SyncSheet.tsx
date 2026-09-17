'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BigButton } from '@/components/ui/BigButton';
import { db } from '@/lib/db/db';
import { useSyncStatus, syncNow, type SyncState } from '@/lib/sync/engine';
import styles from './SyncSheet.module.css';

function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function statusText(state: SyncState, pending: number, lastSyncedAt: number | null): string {
  if (state === 'offline') return 'Offline. Changes are saved on this device.';
  if (pending > 0) return `${pending} change${pending === 1 ? '' : 's'} waiting.`;
  if (state === 'error') return 'Could not sync. Retrying automatically.';
  return lastSyncedAt ? `Up to date, ${timeAgo(lastSyncedAt)}.` : 'Up to date.';
}

/** S31: sync status sheet, opened from TopBar's sync mark. */
export function SyncSheet() {
  const status = useSyncStatus();
  const [syncing, setSyncing] = useState(false);
  // media_blobs is only indexed on media_id (lib/db/db.ts), so this is a
  // full-table filter rather than a `.where('uploaded')` index lookup.
  const photosWaiting = useLiveQuery(() => db.media_blobs.filter((row) => row.uploaded === 0).count(), [], 0);

  async function handleSyncNow(): Promise<void> {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
  }

  return (
    <div className={styles.sheet}>
      <h2>Sync</h2>
      <p className={styles.status}>{statusText(status.state, status.pending, status.last_synced_at)}</p>
      {photosWaiting > 0 ? <p className={styles.muted}>Photos waiting to upload: {photosWaiting}</p> : null}
      <BigButton fullWidth onClick={() => void handleSyncNow()} disabled={syncing}>
        {syncing ? 'Syncing…' : 'Sync now'}
      </BigButton>
    </div>
  );
}
