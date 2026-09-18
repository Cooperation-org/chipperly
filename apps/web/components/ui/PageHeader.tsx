'use client';

import { useRouter } from 'next/navigation';
import { IconButton } from './IconButton';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** Fixed parent route (ux-plan.md 4 "a page replaces the tab content with a top bar Back"). */
  backHref?: string;
  /** Takes priority over `backHref`. Falls back to `router.back()` when neither is given. */
  onBack?: () => void;
  /** Tighter bottom margin (var(--space-3)) for forms that sit directly under the header. */
  compact?: boolean;
}

/** Back + title row for an edit page or a settings page/list; the caregiver shell's own TopBar has no back mode. */
export function PageHeader({ title, backHref, onBack, compact }: PageHeaderProps) {
  const router = useRouter();
  const handleBack = onBack ?? (backHref ? () => router.push(backHref) : () => router.back());
  return (
    <div className={compact ? `${styles.header} ${styles.compact}` : styles.header}>
      <IconButton icon="arrowLeft" aria-label="Back" onClick={handleBack} />
      <h1 className={styles.title}>{title}</h1>
    </div>
  );
}
