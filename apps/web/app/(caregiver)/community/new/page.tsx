import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PostComposer } from '@/components/community/PostComposer';

export const metadata: Metadata = {
  title: 'New community post',
  robots: { index: false, follow: false },
};

export default function NewCommunityPostPage() {
  return (
    <Suspense fallback={null}>
      <PostComposer />
    </Suspense>
  );
}
