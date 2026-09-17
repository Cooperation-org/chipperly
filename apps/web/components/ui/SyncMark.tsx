'use client';

import { Icon } from './Icon';
import styles from './SyncMark.module.css';

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncMarkProps {
  state: SyncState;
  pending?: number;
  onTap?: () => void;
}

const LABEL: Record<SyncState, string> = {
  synced: 'Synced',
  pending: 'Sync pending',
  offline: 'Offline',
  error: 'Sync error',
};

/** ⟳ in the top bar. Three states plus a pending count. Never animates continuously. */
export function SyncMark({ state, pending = 0, onTap }: SyncMarkProps) {
  const label = state === 'pending' && pending > 0 ? `${LABEL.pending}, ${pending} changes waiting` : LABEL[state];
  return (
    <button type="button" className={[styles.mark, styles[state]].join(' ')} onClick={onTap} aria-label={label}>
      <Icon name="sync" size={20} />
      {state === 'pending' && pending > 0 ? <span className={styles.count}>{pending > 9 ? '9+' : pending}</span> : null}
    </button>
  );
}
