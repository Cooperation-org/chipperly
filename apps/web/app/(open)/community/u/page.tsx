import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CommunityProfile } from '@/components/community/CommunityProfile';

export const metadata: Metadata = {
  title: 'Community profile',
  // Same reason as the post page: a static export has one shell for every
  // nickname, so indexing it would index an empty page.
  robots: { index: false, follow: true },
};

export default function CommunityProfilePage() {
  return (
    <Suspense fallback={null}>
      <CommunityProfile />
    </Suspense>
  );
}
