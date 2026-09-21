'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { RegisterDeviceResponse } from '@chipperly/shared/schemas/device';
import { useSession } from '@/lib/auth/session';
import { getDeviceId } from '@/lib/device/identity';
import { api } from '@/lib/api/client';
import { apiBase } from '@/lib/api/base';
import DeviceLocator from '@/lib/native/deviceLocator';

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
    void getDeviceId().then(async (id) => {
      if (cancelled) return;
      try {
        const response = await api.put<RegisterDeviceResponse>(`/me/devices/${id}`, { platform: Capacitor.getPlatform() });
        if (cancelled) return;
        await DeviceLocator.setReportConfig({ deviceId: id, reportToken: response.report_token, apiBase });
      } catch {
        // ponytail: best-effort -- this device just won't show in the list (or answer a locate request) until the next sign-in retries it.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
