'use client';

import { useEffect, useState } from 'react';
import { BillingRedirectSchema, BillingStatusSchema, type BillingStatus } from '@chipperly/shared/schemas/billing';
import { ApiError, api } from '@/lib/api/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { isLive, priceLabel, subscriptionLine } from './billingCopy';
import styles from './BillingPanel.module.css';

/**
 * Subscription card. Renders nothing when the server has no Stripe keys
 * (GET /billing 404s), so the upgrade path does not exist until billing is on.
 */
export function BillingPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    api
      .get<BillingStatus>('/billing', { schema: BillingStatusSchema, signal: ctl.signal })
      .then(setStatus)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.status === 404) && !ctl.signal.aborted) toast('Could not load billing');
      });
    return () => ctl.abort();
  }, []);

  if (!status) return null;
  const sub = status.subscription;

  async function go(path: '/billing/checkout' | '/billing/portal'): Promise<void> {
    setBusy(true);
    try {
      const { url } = await api.post<{ url: string }>(path, undefined, { schema: BillingRedirectSchema });
      window.location.assign(url);
    } catch {
      toast('Could not open billing. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Subscription">
      {sub ? <p>{subscriptionLine(sub)}</p> : <p>You are on the free trial.</p>}
      {!isLive(sub) && status.price && <p className={styles.muted}>{priceLabel(status.price)}</p>}
      {!status.can_manage && <p className={styles.muted}>Only an account admin can change the subscription.</p>}
      {status.can_manage && sub && (
        <Button variant="secondary" loading={busy} onClick={() => void go('/billing/portal')}>
          Manage subscription
        </Button>
      )}
      {status.can_manage && !isLive(sub) && status.checkout_available && (
        <Button loading={busy} onClick={() => void go('/billing/checkout')}>
          Upgrade
        </Button>
      )}
    </section>
  );
}
