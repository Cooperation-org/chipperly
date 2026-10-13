import type { Metadata } from 'next';
import { FeedbackInbox } from '@/components/admin/FeedbackInbox';
import styles from '@/components/admin/AdminShell.module.css';

export const metadata: Metadata = { title: 'Feedback · Admin' };

export default function FeedbackAdminPage() {
  return (
    <>
      <h1 className={styles.pageTitle}>Feedback</h1>
      <FeedbackInbox />
    </>
  );
}
