'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useSession } from '@/lib/auth/session';
import { getDeviceId } from '@/lib/device/identity';
import { api } from '@/lib/api/client';

/**
 * Registers this device (every platform, not just native -- a caregiver's
 * own laptop browser should show up too, if only so they can tell it apart
 * from their child's phone) so it's nameable from Settings > Devices on any
 * other signed-in device. See packages/shared/src/schemas/device.ts for why
 * this is separate from PushRegistrationGuard's push token.
 */
export function DeviceRegistrationGuard(): null {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'signed_in') return;
    let cancelled = false;
    void getDeviceId().then((id) => {
      if (cancelled) return;
      void api.put(`/me/devices/${id}`, { platform: Capacitor.getPlatform() }).catch(() => {
        // ponytail: best-effort -- this device just won't show in the list until the next sign-in retries it.
      });
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
