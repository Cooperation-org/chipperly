'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import AppBlocker from '@/lib/native/appBlocker';
import { subscribeWebPush, webPushSupported } from '@/lib/push/webPush';
import { Button } from '@/components/ui/Button';
import styles from './ProfileForm.module.css';

/** Whether this phone can show reward alerts, with a way to turn notifications on. */
export function NotificationCheck() {
  const native = Capacitor.isNativePlatform();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    function check(): void {
      if (native) void PushNotifications.checkPermissions().then((p) => setGranted(p.receive === 'granted'));
      else if (webPushSupported()) setGranted(Notification.permission === 'granted');
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
    if (!native) {
      const permission = await Notification.requestPermission();
      setGranted(permission === 'granted');
      if (permission === 'granted') await subscribeWebPush();
      return;
    }
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

  if (!native && !webPushSupported()) {
    return (
      <p className={styles.hint}>
        This browser can&rsquo;t get alerts. On iPhone, add Chipperly to your Home Screen (Share, then Add to Home Screen) and turn them on
        from there.
      </p>
    );
  }
  if (granted === null) return null;
  if (granted) return <p className={styles.hint}>Notifications are on for this {native ? 'phone' : 'browser'}.</p>;
  if (!native && Notification.permission === 'denied') {
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
