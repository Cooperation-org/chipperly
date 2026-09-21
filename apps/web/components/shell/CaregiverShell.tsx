'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { useParentMode, useParentModeLoaded, exitParentMode } from '@/lib/device/settings';
import { useSyncStatus } from '@/lib/sync/engine';
import { useSheet } from '@/components/ui/Sheet';
import { TopBar } from '@/components/ui/TopBar';
import { TabBar } from '@/components/ui/TabBar';
import { TabRail } from '@/components/ui/TabRail';
import { TimerPill } from '@/components/timer/TimerPill';
import { SyncSheet } from './SyncSheet';
import styles from './CaregiverShell.module.css';

const TABS = [
  { href: '/today/', label: 'Today', icon: 'home' as const },
  { href: '/chips/', label: 'Chips', icon: 'chips' as const },
  { href: '/timer/', label: 'Timer', icon: 'timer' as const },
  { href: '/first-then/', label: 'First-Then', icon: 'split' as const },
  { href: '/stories/', label: 'Stories', icon: 'book' as const },
];

function ProfileSwitcherSheet({
  profiles,
  onPick,
}: {
  profiles: Profile[];
  onPick: (id: string) => void;
}): ReactNode {
  return (
    <ul className={styles.profileList}>
      {profiles.map((p) => (
        <li key={p.id}>
          <button type="button" className={styles.profileRow} onClick={() => onPick(p.id)}>
            <span aria-hidden>{p.avatar_emoji ?? '🙂'}</span>
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Caregiver route-group shell: TopBar + tab navigation (CONTRACTS.md "Layout rules"). */
export function CaregiverShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  // `useSession().profiles` (the cached /me, available synchronously on
  // mount) gates the redirect so it can't flicker true while Dexie's live
  // query for `useActiveProfile().profiles` (used for the switcher list) is
  // still resolving its first result.
  const { profiles: sessionProfiles } = useSession();
  const { profile, profiles, setActiveProfileId } = useActiveProfile();
  const sync = useSyncStatus();
  const { open, close } = useSheet();
  // The app's default is the child view (lib/device/settings.ts's
  // useParentMode); caregiver screens are the thing UnlockOverlay's PIN/
  // password gate unlocks into, not a route you can just navigate to
  // (deep link, browser back button, a stale bookmark on the web build).
  // `parentModeLoaded` gates the redirect exactly like the old ChildShell
  // gated on locked_profile_id: without it, this mounts (right after
  // UnlockOverlay awaits enterParentMode() and navigates here) and reads
  // parentMode's stale loading-tick fallback of `false` before Dexie's live
  // query re-runs with the just-written `true`, bouncing straight back to
  // /child/ before the real value ever arrives.
  const parentMode = useParentMode();
  const parentModeLoaded = useParentModeLoaded();

  useEffect(() => {
    if (sessionProfiles.length === 0) router.replace('/onboarding/kind/');
    else if (parentModeLoaded && !parentMode) router.replace('/child/');
  }, [sessionProfiles.length, parentModeLoaded, parentMode, router]);

  if (sessionProfiles.length === 0 || !parentModeLoaded || !parentMode) return null;

  return (
    <div className={styles.shell}>
      <TopBar
        profile={
          profile ? { name: profile.name, emoji: profile.avatar_emoji ?? undefined, photo_id: profile.avatar_photo_id } : null
        }
        title={profile?.name ?? 'Chipperly'}
        sync={sync}
        onProfileTap={() =>
          open(
            <ProfileSwitcherSheet
              profiles={profiles}
              onPick={(id) => {
                setActiveProfileId(id);
                close();
              }}
            />,
          )
        }
        onSyncTap={() => open(<SyncSheet />, { title: 'Sync' })}
        onSettingsTap={() => router.push('/settings/')}
        onChildViewTap={() => {
          void exitParentMode();
          router.push('/child/');
        }}
      />
      <TimerPill />
      <main className={styles.content}>{children}</main>
      <div className={styles.tabbarSlot} data-shell-tabbar>
        <TabBar items={TABS} />
      </div>
      <div className={styles.railSlot} data-shell-nav>
        <TabRail items={TABS} />
      </div>
    </div>
  );
}
