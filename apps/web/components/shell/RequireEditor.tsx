'use client';

import type { ReactNode } from 'react';
import { useCanEdit, VIEW_ONLY_MESSAGE } from '@/lib/auth/permissions';

/** Wraps an edit screen: a viewer who reaches it by link sees a plain note instead of the form. */
export function RequireEditor({ children }: { children: ReactNode }) {
  const canEdit = useCanEdit();
  if (!canEdit) return <p role="status">{VIEW_ONLY_MESSAGE}</p>;
  return <>{children}</>;
}
