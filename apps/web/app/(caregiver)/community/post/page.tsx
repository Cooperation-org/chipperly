import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PostDetail } from '@/components/community/PostDetail';

export const metadata: Metadata = {
  title: 'Community post',
  robots: { index: false, follow: false },
};

export default function CommunityPostPage() {
  return (
    <Suspense fallback={null}>
      <PostDetail />
    </Suspense>
  );
}
