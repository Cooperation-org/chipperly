'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db/db';
import { useSyncStatus, syncNow, retryUnsaved, type SyncState } from '@/lib/sync/engine';
import { unsavedEntries } from '@/lib/sync/parkedStore';
import { listConflicts, resolveConflicts } from '@/lib/sync/conflictStore';
import { changedFields } from '@/lib/sync/conflict';
import { toast } from '@/lib/toast';
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

const changes = (n: number): string => `${n} change${n === 1 ? '' : 's'}`;

/** S31: sync status sheet, opened from TopBar's sync mark. */
export function SyncSheet() {
  const status = useSyncStatus();
  const [syncing, setSyncing] = useState(false);
  // media_blobs is only indexed on media_id (lib/db/db.ts), so this is a
  // full-table filter rather than a `.where('uploaded')` index lookup.
  const photosWaiting = useLiveQuery(() => db.media_blobs.filter((row) => row.uploaded === 0).count(), [], 0);

  const conflicts = useLiveQuery(() => listConflicts(), [], []);
  const [picked, setPicked] = useState<Record<string, 'mine' | 'theirs'>>({});

  async function handleResolve(ids: string[], choice: 'mine' | 'theirs'): Promise<void> {
    await resolveConflicts(ids, choice);
    setPicked({});
    await syncNow();
  }

  async function handleSyncNow(): Promise<void> {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
  }

  async function handleRetry(): Promise<void> {
    setSyncing(true);
    await retryUnsaved();
    setSyncing(false);
  }

  /** Everything this device holds that the account does not, as one file: a copy that survives whatever happens to the device. */
  async function handleSaveCopy(): Promise<void> {
    try {
      const data = await unsavedEntries();
      const url = URL.createObjectURL(new Blob([JSON.stringify({ saved_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `chipperly-unsaved-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Couldn't save the copy. Try again.");
    }
  }

  return (
    <div className={styles.sheet}>
      <p className={styles.status}>{statusText(status.state, status.pending, status.last_synced_at)}</p>
      {photosWaiting > 0 ? <p className={styles.muted}>Photos waiting to upload: {photosWaiting}</p> : null}
      {conflicts.length > 0 ? (
        <div className={styles.unsaved} role="alert">
          <p className={styles.status}>
            {changes(conflicts.length)} differ between this device and your account. Nothing has been changed yet. Choose what to keep.
          </p>
          <ul>
            {conflicts.map((entry) => {
              const fields = changedFields(entry.mine, entry.theirs);
              const choice = picked[entry.id];
              return (
                <li key={entry.id}>
                  <p className={styles.status}>
                    {entry.table.replace(/_/g, ' ')}: {fields.join(', ')}
                  </p>
                  {fields.map((field) => (
                    <p key={field} className={styles.muted}>
                      {field}: this device {JSON.stringify(entry.mine[field] ?? null)}, account {JSON.stringify(entry.theirs[field] ?? null)}
                    </p>
                  ))}
                  <Button variant={choice === 'mine' ? 'primary' : 'secondary'} onClick={() => setPicked({ ...picked, [entry.id]: 'mine' })}>
                    Keep this device&rsquo;s
                  </Button>
                  <Button variant={choice === 'theirs' ? 'primary' : 'secondary'} onClick={() => setPicked({ ...picked, [entry.id]: 'theirs' })}>
                    Use the account&rsquo;s
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button variant="secondary" onClick={() => void handleResolve(conflicts.map((c) => c.id), 'mine')}>
            Keep all from this device
          </Button>
          <Button variant="secondary" onClick={() => void handleResolve(conflicts.map((c) => c.id), 'theirs')}>
            Use all from the account
          </Button>
          <Button
            onClick={() => {
              for (const choice of ['mine', 'theirs'] as const) {
                const ids = Object.entries(picked).filter(([, c]) => c === choice).map(([id]) => id);
                if (ids.length) void handleResolve(ids, choice);
              }
            }}
            disabled={Object.keys(picked).length === 0}
          >
            Apply my choices
          </Button>
        </div>
      ) : null}
      {status.held > 0 ? (
        <p className={styles.muted}>
          {changes(status.held)} will be sent again by {status.held === 1 ? 'itself' : 'themselves'}: the account could not take {status.held === 1 ? 'it' : 'them'} just then
          (this device was locked to the child view, or the free trial has ended).
        </p>
      ) : null}
      {status.dead > 0 ? (
        <div className={styles.unsaved} role="alert">
          <p className={styles.status}>
            {changes(status.dead)} could not be saved to your account. {status.dead === 1 ? 'It is' : 'They are'} still on this device, and we have been told.
          </p>
          <p className={styles.muted}>Do not clear this device&rsquo;s data or uninstall the app until this is sorted out.</p>
          <Button variant="secondary" onClick={() => void handleRetry()} disabled={syncing}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => void handleSaveCopy()}>
            Save a copy to this device
          </Button>
        </div>
      ) : null}
      <BigButton fullWidth onClick={() => void handleSyncNow()} disabled={syncing}>
        {syncing ? 'Syncing…' : 'Sync now'}
      </BigButton>
    </div>
  );
}
