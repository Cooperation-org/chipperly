import type { Metadata } from 'next';
import { FailedPaymentsPanel } from '@/components/admin/FailedPaymentsPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Failed payments · Admin' };

export default function FailedPaymentsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Failed payments</h1>
      <FailedPaymentsPanel />
    </>
  );
}
