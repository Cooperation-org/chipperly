import type { Metadata } from 'next';
import { GrowthPanel } from '@/components/admin/GrowthPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Growth · Admin' };

export default function GrowthAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Growth</h1>
      <GrowthPanel />
    </>
  );
}
