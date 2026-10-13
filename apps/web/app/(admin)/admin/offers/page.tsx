import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Offers · Admin' };

export default function OffersAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Early access offers</h1>
      <AdminDashboard show="offers" />
    </>
  );
}
