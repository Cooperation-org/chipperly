import type { Metadata } from 'next';
import { BackupsPanel } from '@/components/admin/BackupsPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Backups · Admin' };

export default function BackupsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Backups</h1>
      <BackupsPanel />
    </>
  );
}
