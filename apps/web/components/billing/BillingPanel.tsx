'use client';

import { useState } from 'react';
import { BillingRedirectSchema, type BillingPlan } from '@chipperly/shared/schemas/billing';
import { api } from '@/lib/api/client';
import { useBillingStatus } from '@/lib/billing/useBillingStatus';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { accessNotice, discountLine, isLive, planChoices, planLine, priceLabel } from './billingCopy';
import styles from './BillingPanel.module.css';

/**
 * Subscription card: current plan, renewal or trial end, the early access
 * discount, the manage link, and the plain-words explanation when new things
 * are paused. Renders nothing when the server has no Stripe keys (GET /billing 404s).
 */
export function BillingPanel() {
  const status = useBillingStatus(() => toast('Could not load billing'));
  const [busy, setBusy] = useState(false);

  if (!status) return null;
  const sub = status.subscription;
  const notice = accessNotice(status.access, status.can_manage);
  const choices = planChoices(status.prices);

  async function go(path: '/billing/checkout' | '/billing/portal', plan?: BillingPlan): Promise<void> {
    setBusy(true);
    try {
      const { url } = await api.post<{ url: string }>(path, plan ? { plan } : undefined, { schema: BillingRedirectSchema });
      window.location.assign(url);
    } catch {
      toast('Could not open billing. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Subscription">
      <p>{planLine(status)}</p>
      {notice && (
        <div className={notice.tone === 'paused' ? styles.notice : styles.muted} role="status">
          <strong>{notice.title}</strong>
          <p>{notice.body}</p>
        </div>
      )}
      {status.discount && <p className={styles.muted}>{discountLine(status.discount)}</p>}
      {!isLive(sub) && status.price && choices.length === 1 && <p className={styles.muted}>{priceLabel(status.price)}</p>}
      {!status.can_manage && <p className={styles.muted}>Only an account admin can change the subscription.</p>}
      {status.can_manage && sub && (
        <Button variant="secondary" loading={busy} onClick={() => void go('/billing/portal')}>
          Manage billing
        </Button>
      )}
      {status.can_manage &&
        !isLive(sub) &&
        status.checkout_available &&
        choices.map((choice, i) => (
          <Button key={choice.plan} variant={i === 0 ? 'primary' : 'secondary'} loading={busy} onClick={() => void go('/billing/checkout', choice.plan)}>
            {choice.label}
          </Button>
        ))}
    </section>
  );
}
