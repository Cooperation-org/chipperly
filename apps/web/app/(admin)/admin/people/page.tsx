import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'People · Admin' };

export default function PeopleAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>People</h1>
      <AdminDashboard show="people" />
    </>
  );
}
