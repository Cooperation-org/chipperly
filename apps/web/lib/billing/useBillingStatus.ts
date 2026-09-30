'use client';

import { useEffect, useState } from 'react';
import { BillingStatusSchema, type BillingStatus } from '@chipperly/shared/schemas/billing';
import { ApiError, api } from '@/lib/api/client';

/**
 * Remembered for the tab's lifetime: with Stripe unconfigured every call is a 404, and
 * this hook sits in the caregiver layout, so without this the app fires a request that
 * cannot succeed on every single page view and logs a console error each time.
 */
let billingOff = false;

/** GET /billing. Null while loading and for good when the server has billing off (404), so callers render nothing. */
export function useBillingStatus(onError?: () => void): BillingStatus | null {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  useEffect(() => {
    if (billingOff) return;
    const ctl = new AbortController();
    api
      .get<BillingStatus>('/billing', { schema: BillingStatusSchema, signal: ctl.signal })
      .then(setStatus)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          billingOff = true;
          return;
        }
        if (!ctl.signal.aborted) onError?.();
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per mount; onError is only a notifier.
  }, []);
  return status;
}
