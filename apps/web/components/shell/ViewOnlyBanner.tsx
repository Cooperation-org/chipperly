'use client';

import { useCanEdit, VIEW_ONLY_MESSAGE } from '@/lib/auth/permissions';
import styles from './ViewOnlyBanner.module.css';

/** Shown on the caregiver shell to a viewer: they can read everything and change nothing. */
export function ViewOnlyBanner() {
  const canEdit = useCanEdit();
  if (canEdit) return null;
  return (
    <div className={styles.banner} role="status">
      {VIEW_ONLY_MESSAGE}
    </div>
  );
}
