'use client';

import { BigButton } from '@/components/ui/BigButton';
import { useSyncStatus, syncNow, type SyncState } from '@/lib/sync/engine';
import styles from './SyncSheet.module.css';

const STATE_LABEL: Record<SyncState, string> = {
  synced: 'Everything is synced.',
  pending: 'Waiting to sync your changes.',
  offline: "Offline. Changes will sync once you're back online.",
  error: 'Could not sync. Retrying automatically.',
};

/** Placeholder sync status sheet, opened from TopBar's sync mark (CONTRACTS.md S31). */
export function SyncSheet() {
  const status = useSyncStatus();

  return (
    <div className={styles.sheet}>
      <h2>Sync</h2>
      <p>{STATE_LABEL[status.state]}</p>
      {status.pending > 0 ? (
        <p className={styles.muted}>
          {status.pending} change{status.pending === 1 ? '' : 's'} waiting.
        </p>
      ) : null}
      {status.last_synced_at ? (
        <p className={styles.muted}>Last synced {new Date(status.last_synced_at).toLocaleTimeString()}</p>
      ) : null}
      <BigButton fullWidth onClick={() => void syncNow()}>
        Sync now
      </BigButton>
    </div>
  );
}
