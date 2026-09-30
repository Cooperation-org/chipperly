'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a connection.
 *
 * This is the right signal for anything online-only (the community, an address
 * lookup, an invite email). Do NOT use the sync engine's state for that: it
 * describes the authenticated sync loop, starts as 'offline', and never leaves
 * it for a signed-out reader — which made the public community feed claim to be
 * offline to the very people it exists for.
 *
 * navigator.onLine is optimistic (it stays true on wifi with no internet), so
 * treat it as "worth trying", and let the request itself report a real failure.
 */
export function useOnline(): boolean {
  // Guard on `window`, not `navigator`: Node 22 defines a global navigator, but with
  // no `onLine`, so a navigator check passes during the static build and reads
  // undefined. That baked "You're offline" into the prerendered community page and
  // then mismatched on hydration. Anything but an explicit false means online.
  const [online, setOnline] = useState(() => (typeof window === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
