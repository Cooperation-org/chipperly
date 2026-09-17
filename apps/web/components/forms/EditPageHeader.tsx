'use client';

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import styles from './EditPageHeader.module.css';

export interface EditPageHeaderProps {
  title: string;
  /** Defaults to router.back() when there's history to go back to. */
  onBack?: () => void;
}

/** S9 / S19: the page's own header row (the shell's TopBar shows the profile, not the page title). */
export function EditPageHeader({ title, onBack }: EditPageHeaderProps) {
  const router = useRouter();
  return (
    <div className={styles.header}>
      <IconButton icon="arrowLeft" aria-label="Back" onClick={onBack ?? (() => router.back())} />
      <h1 className={styles.title}>{title}</h1>
    </div>
  );
}
