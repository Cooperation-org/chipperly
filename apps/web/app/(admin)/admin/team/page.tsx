import type { Metadata } from 'next';
import { TeamPanel } from '@/components/admin/TeamPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Admin team · Admin' };

export default function TeamAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Admin team</h1>
      <TeamPanel />
    </>
  );
}
