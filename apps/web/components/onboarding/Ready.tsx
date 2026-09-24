'use client';

import { useRouter } from 'next/navigation';
import { useActiveProfile } from '@/lib/profile/active';
import { startSync } from '@/lib/sync/engine';
import { enterParentMode } from '@/lib/device/settings';
import { asksDeviceRole, setDeviceRole, usesApp } from '@/lib/device/role';
import { BigButton } from '@/components/ui/BigButton';
import { Picture } from '@/components/media/Picture';
import styles from './Ready.module.css';

/** S5: ready. */
export function Ready() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const name = profile?.name ?? 'them';

  // The caregiver just finished setting this profile up and is almost
  // certainly about to keep editing (more routines, rewards) -- land them
  // in caregiver mode directly rather than the child view they'd otherwise
  // default to (lib/device/settings.ts's useParentMode) and immediately
  // need to unlock past.
  async function goToToday(): Promise<void> {
    // A phone or tablet could be the child's; ask. Otherwise this is the caregiver's device.
    if (asksDeviceRole() && profile && usesApp(profile)) {
      router.push('/onboarding/device/');
      return;
    }
    startSync();
    await setDeviceRole({ kind: 'caregiver' });
    await enterParentMode();
    router.push('/today/');
  }

  return (
    <div className={styles.wrap}>
      {profile ? (
        <Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="grid" />
      ) : null}
      <h1 className={styles.title}>{profile ? `${profile.name} is ready.` : 'Ready.'}</h1>
      <p className={styles.text}>We added starter activities, rewards and a daily plan for {name}. Change anything later.</p>
      <BigButton fullWidth onClick={() => void goToToday()}>
        Go to Today
      </BigButton>
      {profile && usesApp(profile) ? (
        <p className={styles.quiet}>Sharing this device with {name}? You can lock it to their view from the lock button at the top.</p>
      ) : null}
    </div>
  );
}
