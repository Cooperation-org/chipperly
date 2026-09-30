import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PostDetail } from '@/components/community/PostDetail';
import { GuestGate } from '@/components/auth/GuestGate';

export const metadata: Metadata = {
  title: 'Community post',
  // Readable by anyone, but not indexable: this is a static export, so every
  // post shares one shell and the id arrives as ?id=. Indexing it would index
  // an empty page. The feed at /community/ is the discoverable entry point.
  robots: { index: false, follow: true },
};

export default function CommunityPostPage() {
  return (
    <Suspense fallback={null}>
      <GuestGate><PostDetail /></GuestGate>
    </Suspense>
  );
}
