import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivityForm } from '@/components/forms/ActivityForm';

export const metadata: Metadata = { title: 'Edit activity', robots: { index: false, follow: false } };

export default function ActivityEditPage() {
  return (
    <Suspense fallback={null}>
      <ActivityForm />
    </Suspense>
  );
}
