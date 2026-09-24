'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useKv, setKv } from '@/lib/db/kv';
import { usesApp, useDeviceRole } from '@/lib/device/role';
import { useNotifications } from '@/lib/push/useNotifications';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import styles from './RewardAlertsBanner.module.css';

const DISMISSED_KEY = 'reward_alerts_banner_dismissed';

/** On the caregiver's Today: reward alerts are on for a child, but this device can't show them yet. */
export function RewardAlertsBanner() {
  const role = useDeviceRole();
  const dismissed = useKv<boolean>(DISMISSED_KEY, false);
  const wanted = useLiveQuery(
    () => db.profiles.filter((p) => p.deleted_at === null && usesApp(p) && p.settings.reward_alerts !== false).count(),
    [],
    0,
  );
  const { state, turnOn } = useNotifications();

  if (dismissed || role?.kind === 'child' || wanted === 0 || state === 'on' || state === 'loading') return null;

  return (
    <div className={styles.banner} role="status">
      <span aria-hidden="true" className={styles.bell}>
        🔔
      </span>
      <p className={styles.text}>
        {state === 'unsupported'
          ? 'Reward alerts can’t reach this browser. On iPhone, add Chipperly to your Home Screen first.'
          : state === 'blocked'
            ? 'Reward alerts are blocked in this browser. Allow notifications in its site settings.'
            : 'Reward alerts are off on this device.'}
      </p>
      {state === 'off' ? (
        <Button variant="secondary" onClick={() => void turnOn()}>
          Turn on
        </Button>
      ) : null}
      <IconButton icon="close" aria-label="Hide this" onClick={() => void setKv(DISMISSED_KEY, true)} />
    </div>
  );
}
