import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import AppBlocker from '@/lib/native/appBlocker';
import { subscribeWebPush, webPushSupported } from './webPush';

/** 'unsupported': a browser with no push (iPhone Safari outside the Home Screen). 'blocked': a browser that refused, only its site settings can undo it. */
export type NotificationState = 'loading' | 'on' | 'off' | 'blocked' | 'unsupported';

/** This device's notification permission for reward alerts, rechecked on return from system settings, plus a way to turn it on. */
export function useNotifications(): { state: NotificationState; native: boolean; turnOn: () => Promise<void> } {
  const native = Capacitor.isNativePlatform();
  const [state, setState] = useState<NotificationState>('loading');

  useEffect(() => {
    function check(): void {
      if (native) {
        void PushNotifications.checkPermissions().then((p) => setState(p.receive === 'granted' ? 'on' : 'off'));
      } else if (!webPushSupported()) {
        setState('unsupported');
      } else {
        setState(Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');
      }
    }
    check();
    function onVisible(): void {
      if (document.visibilityState === 'visible') check();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native]);

  async function turnOn(): Promise<void> {
    if (!native) {
      const permission = await Notification.requestPermission();
      setState(permission === 'granted' ? 'on' : permission === 'denied' ? 'blocked' : 'off');
      if (permission === 'granted') await subscribeWebPush();
      return;
    }
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      setState('on');
      // PushRegistrationGuard's listener sends the new token to the server.
      await PushNotifications.register();
    } else {
      // Android stops asking once refused; the app's own notification settings still can.
      await AppBlocker.openNotificationSettings();
    }
  }

  return { state, native, turnOn };
}
