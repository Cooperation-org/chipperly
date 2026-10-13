import type { Metadata } from 'next';
import { ReportQueue } from '@/components/community/moderation/ReportQueue';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Moderation · Admin' };

export default function ModerationAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Moderation</h1>
      <ReportQueue />
    </>
  );
}
