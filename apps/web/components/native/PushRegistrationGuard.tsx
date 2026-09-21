'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useSession } from '@/lib/auth/session';
import { api } from '@/lib/api/client';

/**
 * Registers this device for push once signed in, and tells the server the
 * token so /profiles/:id/location-changed (apps/api/src/routes/accounts.ts)
 * can reach a care-team member's device. A no-op in a plain browser tab --
 * Capacitor.isNativePlatform() is false there, and the web implementation
 * of this plugin has no token to give anyway.
 */
export function PushRegistrationGuard(): null {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'signed_in' || !Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const registrationHandle = PushNotifications.addListener('registration', (token) => {
      if (cancelled) return;
      void api.put('/me/push-token', { token: token.value, platform: Capacitor.getPlatform() }).catch(() => {
        // ponytail: best-effort -- a failed registration just means no push
        // reaches this device until the next app start retries it.
      });
    });
    const errorHandle = PushNotifications.addListener('registrationError', (err) => {
      console.error('PushRegistrationGuard: registration failed', err);
    });

    void PushNotifications.requestPermissions().then((result) => {
      if (!cancelled && result.receive === 'granted') void PushNotifications.register();
    });

    return () => {
      cancelled = true;
      void registrationHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
    };
  }, [status]);

  return null;
}
