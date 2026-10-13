import type { Metadata } from 'next';
import { OrgsPanel } from '@/components/admin/OrgsPanel';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Organizations · Admin' };

export default function OrgsAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Organizations</h1>
      <OrgsPanel />
    </>
  );
}
