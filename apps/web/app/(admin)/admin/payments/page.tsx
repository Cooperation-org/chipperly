import type { Metadata } from 'next';
import { ChargesPanel } from '@/components/admin/ChargesPanel';
import { PaymentsLog } from '@/components/admin/PaymentsLog';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Payments · Admin' };

export default function PaymentsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Payments</h1>
      <ChargesPanel />
      <PaymentsLog />
    </>
  );
}
