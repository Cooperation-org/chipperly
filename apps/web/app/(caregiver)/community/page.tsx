import type { Metadata } from 'next';
import { CommunityFeed } from '@/components/community/CommunityFeed';

export const metadata: Metadata = {
  title: 'Community',
  robots: { index: false, follow: false },
};

export default function CommunityPage() {
  return <CommunityFeed />;
}
