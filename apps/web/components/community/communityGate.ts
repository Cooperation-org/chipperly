'use client';

import { createElement, useCallback } from 'react';
import { PinPad } from '@/components/pin/PinPad';
import { useSheet } from '@/components/ui/Sheet';
import { verifyPin } from '@/lib/auth/pin';
import { useSession } from '@/lib/auth/session';
import { useLock } from '@/lib/device/settings';

const TITLE = 'Team PIN needed';

/**
 * The UI half of the PIN gate (the server also refuses a locked session).
 * `const requirePin = useCommunityGate(); if (!(await requirePin())) return;`
 * Resolves true straight away on an unlocked device; on a locked one it shows the
 * existing PinPad in a sheet and resolves true only for the right PIN, false if dismissed.
 */
export function useCommunityGate(): () => Promise<boolean> {
  const { user } = useSession();
  const { locked_profile_id } = useLock();
  const sheet = useSheet();
  const pinHash = user?.pin_hash;

  return useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (!locked_profile_id) {
          resolve(true);
          return;
        }
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        let shown = false;
        const show = (error?: string): void => {
          const content = createElement(PinPad, {
            title: 'Enter the team PIN to open the community',
            error,
            onComplete: async (pin: string) => {
              if (!pinHash) return false;
              const ok = await verifyPin(pin, pinHash).catch(() => false);
              if (ok) {
                finish(true);
                sheet.close();
                return true;
              }
              show('That PIN is not right, try again');
              return false;
            },
          });
          const opts = { title: TITLE, onClose: () => finish(false) };
          if (shown) sheet.replace(content, opts);
          else sheet.open(content, opts);
          shown = true;
        };
        show(pinHash ? undefined : 'No team PIN is set yet. Ask a caregiver to set one in Settings.');
      }),
    [locked_profile_id, pinHash, sheet],
  );
}
