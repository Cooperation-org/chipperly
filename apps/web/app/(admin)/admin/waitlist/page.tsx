import type { Metadata } from 'next';
import { WaitlistPanel } from '@/components/admin/WaitlistPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Waitlist · Admin' };

export default function WaitlistAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Waitlist</h1>
      <WaitlistPanel />
    </>
  );
}
