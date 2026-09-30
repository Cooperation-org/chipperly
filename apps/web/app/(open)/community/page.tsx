import type { Metadata } from 'next';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { OG_IMAGES } from '@/app/ogImage';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Visual schedules, routines and social stories shared by other Chipperly families.',
  alternates: { canonical: '/community/' },
  openGraph: {
    title: 'Chipperly community',
    description: 'Visual schedules, routines and social stories shared by other Chipperly families.',
    url: '/community/',
    type: 'website',
    images: OG_IMAGES,
  },
};

export default function CommunityPage() {
  return <CommunityFeed />;
}
