import type { Metadata } from 'next';
import { SyncHealthPanel } from '@/components/admin/SyncHealthPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Sync health · Admin' };

export default function SyncAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Sync health</h1>
      <SyncHealthPanel />
    </>
  );
}
