'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { useLock, useLockLoaded, useParentMode, useParentModeLoaded } from '@/lib/device/settings';
import { usesApp, useCaregiverDevice } from '@/lib/device/role';
import { lockToChild } from '@/lib/device/lock';
import { useBlockingReady } from '@/lib/native/useBlockingReady';
import { LockSheet } from '@/components/settings/LockSheet';
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
  const pathname = usePathname();
  // `useSession().profiles` (the cached /me, available synchronously on
  // mount) gates the redirect so it can't flicker true while Dexie's live
  // query for `useActiveProfile().profiles` (used for the switcher list) is
  // still resolving its first result.
  const { status: sessionStatus, profiles: sessionProfiles, user } = useSession();
  const blockingReady = useBlockingReady();
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
  // A caregiver's own device needs no PIN, unless it's been locked to a child for now.
  const caregiverDevice = useCaregiverDevice();
  const { locked_profile_id } = useLock();
  const lockLoaded = useLockLoaded();
  const decided = parentModeLoaded && lockLoaded && caregiverDevice !== undefined;
  const allowed = parentMode || (caregiverDevice === true && !locked_profile_id);

  useEffect(() => {
    // Same reasoning as ChildShell/KindPicker's matching guards: `status`
    // must have actually settled to signed_in before an empty
    // `sessionProfiles` means "onboard this account" rather than "still
    // loading" or "a sync 401 just cleared it" -- otherwise this bounces to
    // /onboarding/kind/ right as ChildShell bounces away from it too.
    if (sessionStatus === 'signed_out') router.replace('/');
    else if (sessionStatus === 'signed_in' && sessionProfiles.length === 0) router.replace('/onboarding/kind/');
    // Carries the route a caregiver was actually trying to reach (a bookmark,
    // a deep link, this same e2e-style direct nav) through UnlockOverlay's
    // PIN/password gate, so unlocking lands back where they meant to go
    // instead of always dumping them on Today.
    // Locking isn't trying to reach this page, so no ?next= (unlocking should land on Today, not back here).
    else if (decided && !allowed) router.replace(locked_profile_id ? '/child/' : `/child/?next=${encodeURIComponent(pathname)}`);
  }, [sessionStatus, sessionProfiles.length, decided, allowed, locked_profile_id, router, pathname]);

  // No PIN yet: set one first (you need it to get back), then lock.
  async function lockNow(profileId: string, blockApps: boolean): Promise<void> {
    if (!user?.pin_hash) {
      open(<LockSheet profileId={profileId} lockAfter={blockApps ? 'lockPhone' : 'lock'} />, { title: 'Set a PIN' });
      return;
    }
    await lockToChild(profileId, { blockApps });
    router.push('/child/');
  }

  if (sessionStatus !== 'signed_in' || sessionProfiles.length === 0 || !decided || !allowed) return null;
  // Lock buttons only for a child who uses the app themselves.
  const lockable = profile && usesApp(profile) ? profile : null;

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
        onLockTap={lockable ? () => void lockNow(lockable.id, false) : undefined}
        lockLabel={lockable ? `Lock to ${lockable.name}` : undefined}
        onLockPhoneTap={lockable && blockingReady ? () => void lockNow(lockable.id, true) : undefined}
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
