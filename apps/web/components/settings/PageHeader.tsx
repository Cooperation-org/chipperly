'use client';

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** Fixed parent route (ux-plan.md 4 "a page replaces the tab content with a top bar Back"). */
  backHref: string;
}

/** Back + title for a settings page/list; the caregiver shell's own TopBar has no back mode. */
export function PageHeader({ title, backHref }: PageHeaderProps) {
  const router = useRouter();
  return (
    <div className={styles.header}>
      <IconButton icon="arrowLeft" aria-label="Back" onClick={() => router.push(backHref)} />
      <h1 className={styles.title}>{title}</h1>
    </div>
  );
}
