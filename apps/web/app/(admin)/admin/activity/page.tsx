import type { Metadata } from 'next';
import { ActivityLog } from '@/components/admin/ActivityLog';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Activity · Admin' };

export default function ActivityAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Activity</h1>
      <ActivityLog />
    </>
  );
}
