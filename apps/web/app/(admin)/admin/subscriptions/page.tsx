import type { Metadata } from 'next';
import { SubscriptionsPanel } from '@/components/admin/SubscriptionsPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Subscriptions · Admin' };

export default function SubscriptionsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Subscriptions</h1>
      <SubscriptionsPanel />
    </>
  );
}
