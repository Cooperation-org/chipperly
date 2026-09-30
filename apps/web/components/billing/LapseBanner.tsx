'use client';

import Link from 'next/link';
import { useBillingStatus } from '@/lib/billing/useBillingStatus';
import { accessNotice } from './billingCopy';
import styles from './BillingPanel.module.css';

/**
 * A quiet strip for the caregiver screens: shows only when the trial has ended
 * (grace or paused). Renders nothing with billing off, and is never mounted in
 * the child view. Mount it in the caregiver layout.
 */
export function LapseBanner() {
  const status = useBillingStatus();
  const notice = status ? accessNotice(status.access, status.can_manage) : null;
  if (!status || !notice) return null;
  return (
    <div className={notice.tone === 'paused' ? styles.notice : styles.strip} role="status">
      <strong>{notice.title}.</strong> {notice.body}{' '}
      <Link href="/settings/billing/">Subscription</Link>
    </div>
  );
}
