import type { Metadata } from 'next';
import { RequireEditor } from '@/components/shell/RequireEditor';
import { Suspense } from 'react';
import { ActivityForm } from '@/components/forms/ActivityForm';

export const metadata: Metadata = { title: 'Edit activity', robots: { index: false, follow: false } };

export default function ActivityEditPage() {
  return (
    <Suspense fallback={null}>
      <RequireEditor>
        <ActivityForm />
      </RequireEditor>
    </Suspense>
  );
}
