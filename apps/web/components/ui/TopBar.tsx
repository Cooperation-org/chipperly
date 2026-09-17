'use client';

import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { PictureTile } from './PictureTile';
import { SyncMark, type SyncState } from './SyncMark';
import styles from './TopBar.module.css';

export interface TopBarProfile {
  name: string;
  emoji?: string;
  photo_id?: string | null;
  photoUrl?: string | null;
}

export interface TopBarProps {
  profile: TopBarProfile | null;
  onProfileTap?: () => void;
  title?: string;
  sync: { state: SyncState; pending?: number };
  onSyncTap?: () => void;
  onSettingsTap?: () => void;
}

/**
 * 56px top bar: avatar + profile switcher, or a title, plus the sync mark and gear.
 * The name/title here is shell chrome, not the page's semantic heading (a page
 * supplies its own h1, or none, per CONTRACTS.md "Layout rules") - so it's a
 * plain span, never an h1, to keep exactly one h1 per route.
 */
export function TopBar({ profile, onProfileTap, title, sync, onSyncTap, onSettingsTap }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.leading}>
        {profile ? (
          <button type="button" className={styles.profile} onClick={onProfileTap}>
            <PictureTile emoji={profile.emoji} photo_id={profile.photo_id} photoUrl={profile.photoUrl} name={profile.name} size="list" />
            <span className={styles.name}>{profile.name}</span>
            <Icon name="chevron" size={16} className={styles.chevron} />
          </button>
        ) : title ? (
          <span className={styles.title}>{title}</span>
        ) : null}
      </div>
      <div className={styles.trailing}>
        <SyncMark state={sync.state} pending={sync.pending} onTap={onSyncTap} />
        <IconButton icon="gear" aria-label="Settings" onClick={onSettingsTap} />
      </div>
    </header>
  );
}
