'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import AppBlocker from '@/lib/native/appBlocker';
import { Button } from '@/components/ui/Button';
import styles from './ProfileForm.module.css';

/** Whether this phone can show reward alerts, with a way to turn notifications on. */
export function NotificationCheck() {
  const native = Capacitor.isNativePlatform();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!native) return;
    function check(): void {
      void PushNotifications.checkPermissions().then((p) => setGranted(p.receive === 'granted'));
    }
    check();
    // Back from system notification settings.
    function onVisible(): void {
      if (document.visibilityState === 'visible') check();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native]);

  async function turnOn(): Promise<void> {
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      setGranted(true);
      // PushRegistrationGuard's listener sends the new token to the server.
      await PushNotifications.register();
    } else {
      // Android stops asking once refused; the app's own notification settings still can.
      await AppBlocker.openNotificationSettings();
    }
  }

  if (!native) return <p className={styles.hint}>Alerts go to the Chipperly app on caregivers&rsquo; Android phones.</p>;
  if (granted === null) return null;
  if (granted) return <p className={styles.hint}>Notifications are on for this phone.</p>;
  return (
    <div className={styles.setting}>
      <p className={styles.warning} role="alert">
        Notifications are off on this phone, so alerts can&rsquo;t reach it.
      </p>
      <Button variant="secondary" onClick={() => void turnOn()}>
        Turn on notifications
      </Button>
    </div>
  );
}
