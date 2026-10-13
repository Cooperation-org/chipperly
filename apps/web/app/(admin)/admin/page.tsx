import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AttentionCards } from '@/components/admin/AttentionCards';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Today · Admin' };

export default function TodayAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Today</h1>
      <AttentionCards />
      <AdminDashboard show="today" />
    </>
  );
}
