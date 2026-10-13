import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Overview · Admin' };

export default function OverviewAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Overview</h1>
      <AdminDashboard />
    </>
  );
}
