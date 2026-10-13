import type { Metadata } from 'next';
import { PaymentsLog } from '@/components/admin/PaymentsLog';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Stripe messages · Admin' };

export default function StripeAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Stripe messages</h1>
      <PaymentsLog />
    </>
  );
}
