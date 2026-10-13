import type { Metadata } from 'next';
import { RequireEditor } from '@/components/shell/RequireEditor';
import { Suspense } from 'react';
import { RewardForm } from '@/components/forms/RewardForm';

export const metadata: Metadata = { title: 'Edit reward', robots: { index: false, follow: false } };

export default function RewardEditPage() {
  return (
    <Suspense fallback={null}>
      <RequireEditor>
        <RewardForm />
      </RequireEditor>
    </Suspense>
  );
}
