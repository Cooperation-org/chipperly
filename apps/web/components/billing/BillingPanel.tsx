'use client';

import { useState } from 'react';
import type { AccountKind } from '@chipperly/shared/schemas/account';
import { BillingRedirectSchema, type BillingPlan } from '@chipperly/shared/schemas/billing';
import { api, ApiError } from '@/lib/api/client';
import { useBillingStatus } from '@/lib/billing/useBillingStatus';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { accessNotice, checkoutOffer, discountLine, isLive, KIND_LABEL, paysByArrangement, planChoices, planLine, priceLabel } from './billingCopy';
import styles from './BillingPanel.module.css';

/**
 * Subscription card: current plan, renewal or trial end, the early access
 * discount, the manage link, and the plain-words explanation when new things
 * are paused. Renders nothing when the server has no Stripe keys (GET /billing 404s).
 */
export function BillingPanel() {
  const status = useBillingStatus(() => toast('Could not load billing'));
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<AccountKind | null>(null);

  if (!status) return null;
  const sub = status.subscription;
  const notice = accessNotice(status.access, status.can_manage, undefined, undefined, paysByArrangement(status));
  const offer = checkoutOffer(status, picked);
  const choices = planChoices(offer.prices);
  // One price: say what the picked plan costs, not the account's current one.
  const shown = offer.prices[0] ?? status.price;

  async function go(path: '/billing/checkout' | '/billing/portal', plan?: BillingPlan): Promise<void> {
    setBusy(true);
    try {
      const { url } = await api.post<{ url: string }>(path, plan ? { plan, kind: offer.kind } : undefined, { schema: BillingRedirectSchema });
      window.location.assign(url);
    } catch (err) {
      toast(err instanceof ApiError && (err.code === 'too_many_profiles' || err.code === 'too_many_admins') ? err.message : 'Could not open billing. Try again in a moment.');
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
      {!isLive(sub) && shown && choices.length === 1 && <p className={styles.muted}>{priceLabel(shown)}</p>}
      {!status.can_manage && <p className={styles.muted}>Only an account admin can change the subscription.</p>}
      {status.can_manage && sub && (
        <Button variant="secondary" loading={busy} onClick={() => void go('/billing/portal')}>
          Change plan or manage billing
        </Button>
      )}
      {sub && (
        <p className={styles.muted}>
          If you cancel a yearly plan, we refund the part you have not used when you ask. A monthly plan is not refunded: it just runs to the end of the month you paid for.
        </p>
      )}
      {paysByArrangement(status) && status.access.state !== 'subscribed' && (
        <p>
          Organization plans are priced by the number of people you support. Write to{' '}
          <a href="mailto:support@chipperlyapp.com?subject=Organization%20plan">support@chipperlyapp.com</a> and we will set yours up.
        </p>
      )}
      {status.can_manage && !isLive(sub) && offer.picker && (
        <Segmented label="Plan" value={offer.kind ?? status.kind} onChange={(v) => setPicked(v as AccountKind)} items={status.kinds.map((k) => ({ value: k.kind, label: KIND_LABEL[k.kind] }))} />
      )}
      {status.can_manage &&
        !isLive(sub) &&
        offer.canBuy &&
        choices.map((choice, i) => (
          <Button key={choice.plan} variant={i === 0 ? 'primary' : 'secondary'} loading={busy} onClick={() => void go('/billing/checkout', choice.plan)}>
            {choice.label}
          </Button>
        ))}
    </section>
  );
}
