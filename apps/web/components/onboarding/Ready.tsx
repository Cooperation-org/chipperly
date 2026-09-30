'use client';

import { useRouter } from 'next/navigation';
import type { SetupAnswers } from '@chipperly/shared/schemas/profile';
import { buildSeed } from '@chipperly/shared/constants/setup';
import { useActiveProfile } from '@/lib/profile/active';
import { useLocations } from '@/lib/data/locations';
import { useRewards } from '@/lib/data/rewards';
import { useKv } from '@/lib/db/kv';
import { startSync } from '@/lib/sync/engine';
import { enterParentMode } from '@/lib/device/settings';
import { asksDeviceRole, setDeviceRole, usesApp } from '@/lib/device/role';
import { BigButton } from '@/components/ui/BigButton';
import { Picture } from '@/components/media/Picture';
import { SETUP_ANSWERS_KEY } from './FirstProfileForm';
import styles from './Ready.module.css';

/** S5: ready. */
export function Ready() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const name = profile?.name ?? 'them';
  const answers = useKv<SetupAnswers | null>(SETUP_ANSWERS_KEY, null);
  const plan = answers ? buildSeed(answers) : null;
  const routines = plan?.activities.filter((a) => a.steps && a.steps.length > 0) ?? [];
  const repeating = plan?.activities.filter((a) => a.recurrence).length ?? 0;
  // Guided setup made its locations and rewards on this device (the plan has none), so read them back.
  const guided = answers?.guided === true;
  const places = useLocations(guided ? (profile?.id ?? '') : '');
  const rewards = useRewards(guided ? (profile?.id ?? '') : '');
  const freeChoices = rewards.filter((r) => r.always_available);
  const earned = rewards.filter((r) => !r.always_available);

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
      {plan ? (
        <>
          <ul className={styles.summary}>
            {routines.map((routine) => (
              <li key={routine.name}>
                <span aria-hidden="true">{routine.emoji}</span> {routine.name} · {routine.steps!.length} steps
              </li>
            ))}
            <li>
              <span aria-hidden="true">📅</span> {repeating} repeating activities fill each day
            </li>
            {guided ? (
              <>
                <li>
                  <span aria-hidden="true">📍</span> {places.map((l) => l.name).join(', ')}
                </li>
                <li>
                  <span aria-hidden="true">🎈</span> Free choices: {freeChoices.length > 0 ? freeChoices.map((r) => r.name).join(', ') : 'none yet'}
                </li>
                <li>
                  <span aria-hidden="true">⭐</span> Earned with chips: {earned.length > 0 ? earned.map((r) => `${r.name} (${r.chip_cost})`).join(', ') : 'none yet'}
                </li>
              </>
            ) : (
              <li>
                <span aria-hidden="true">⭐</span> {plan.rewards.length} rewards · {plan.locations.map((l) => l.name).join(', ')}
              </li>
            )}
          </ul>
          <p className={styles.text}>Change anything later.</p>
        </>
      ) : (
        <p className={styles.text}>We added starter activities, rewards and a daily plan for {name}. Change anything later.</p>
      )}
      <BigButton fullWidth onClick={() => void goToToday()}>
        Go to Today
      </BigButton>
      {profile && usesApp(profile) ? (
        <p className={styles.quiet}>Sharing this device with {name}? You can lock it to their view from the lock button at the top.</p>
      ) : null}
    </div>
  );
}
