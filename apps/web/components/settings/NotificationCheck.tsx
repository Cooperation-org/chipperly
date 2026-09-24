'use client';

import { useNotifications } from '@/lib/push/useNotifications';
import { Button } from '@/components/ui/Button';
import styles from './ProfileForm.module.css';

/** Whether this phone can show reward alerts, with a way to turn notifications on. */
export function NotificationCheck() {
  const { state, native, turnOn } = useNotifications();

  if (state === 'unsupported') {
    return (
      <p className={styles.hint}>
        This browser can&rsquo;t get alerts. On iPhone, add Chipperly to your Home Screen (Share, then Add to Home Screen) and turn them on
        from there.
      </p>
    );
  }
  if (state === 'loading') return null;
  if (state === 'on') return <p className={styles.hint}>Notifications are on for this {native ? 'phone' : 'browser'}.</p>;
  if (state === 'blocked') {
    return (
      <p className={styles.warning} role="alert">
        Notifications are blocked for Chipperly in this browser. Allow them in the site settings (the lock icon by the address), then come back.
      </p>
    );
  }
  return (
    <div className={styles.setting}>
      <p className={styles.warning} role="alert">
        Notifications are off on this {native ? 'phone' : 'browser'}, so alerts can&rsquo;t reach it.
      </p>
      <Button variant="secondary" onClick={() => void turnOn()}>
        Turn on notifications
      </Button>
    </div>
  );
}
