'use client';

import { useRouter } from 'next/navigation';
import { useActiveProfile } from '@/lib/profile/active';
import { startSync } from '@/lib/sync/engine';
import { BigButton } from '@/components/ui/BigButton';
import { Picture } from '@/components/media/Picture';
import styles from './Ready.module.css';

/** S5: ready. */
export function Ready() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const name = profile?.name ?? 'them';

  function goToToday(): void {
    startSync();
    router.push('/today/');
  }

  return (
    <div className={styles.wrap}>
      {profile ? (
        <Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="grid" />
      ) : null}
      <h1 className={styles.title}>{profile ? `${profile.name} is ready.` : 'Ready.'}</h1>
      <p className={styles.text}>We added starter activities and rewards for {name}. Change anything later.</p>
      <BigButton fullWidth onClick={goToToday}>
        Go to Today
      </BigButton>
      <p className={styles.quiet}>Sharing this device with {name}? You can lock it to their view from Settings.</p>
    </div>
  );
}
