import type { Metadata } from 'next';
import { ErrorsPanel } from '@/components/admin/ErrorsPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'App errors · Admin' };

export default function ErrorsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>App errors</h1>
      <ErrorsPanel />
    </>
  );
}
