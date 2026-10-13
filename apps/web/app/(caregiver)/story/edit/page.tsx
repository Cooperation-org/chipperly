import { RequireEditor } from '@/components/shell/RequireEditor';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StoryForm } from '@/components/story/StoryForm';

export const metadata: Metadata = {
  title: 'Edit story',
  robots: { index: false, follow: false },
};

export default function StoryEditPage() {
  return (
    <Suspense fallback={null}>
      <RequireEditor>
        <StoryForm />
      </RequireEditor>
    </Suspense>
  );
}
