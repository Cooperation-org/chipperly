'use client';

import { useState } from 'react';
import { sellingErrorMessage, startSellerOnboarding, useSellerStatus } from '@/lib/data/community';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import styles from './SellerSetup.module.css';

/**
 * Payout setup for selling a shared item, done on Stripe's own pages. Where the server has
 * no Stripe (GET /community/selling 404s) the status stays null and this screen says selling
 * is not available; no other screen links here.
 */
export function SellerSetup() {
  const { status } = useSellerStatus();
  const [busy, setBusy] = useState(false);

  async function go(): Promise<void> {
    setBusy(true);
    try {
      window.location.assign(await startSellerOnboarding());
    } catch (e) {
      toast(sellingErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <PageHeader title="Selling" backHref="/community/" compact />
      {status === null ? (
        <EmptyState sentence="Selling isn't available right now." />
      ) : (
        <section className={styles.card} aria-label="Payout setup">
          <p>
            To charge for a story or routine, Stripe needs to check who you are and where to send the money. You do that on
            Stripe&apos;s page, not here.
          </p>
          <ul className={styles.checks}>
            <li>{status.details_submitted ? 'Details sent to Stripe' : 'Details not sent to Stripe yet'}</li>
            <li>{status.charges_enabled ? 'Can take payments' : 'Cannot take payments yet'}</li>
            <li>{status.payouts_enabled ? 'Can be paid out' : 'Cannot be paid out yet'}</li>
          </ul>
          {status.reason ? (
            <p className={styles.muted} role="status">
              {status.reason}
            </p>
          ) : (
            <p role="status">You can set a price when you share a story or routine.</p>
          )}
          {status.can_sell ? null : status.fee_configured ? (
            <Button loading={busy} onClick={() => void go()}>
              {status.connected ? 'Continue setup on Stripe' : 'Set up payouts'}
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}
