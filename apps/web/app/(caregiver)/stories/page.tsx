import type { Metadata } from 'next';
import { StoriesScreen } from '@/components/story/StoriesScreen';

export const metadata: Metadata = {
  title: 'Stories',
  robots: { index: false, follow: false },
};

export default function StoriesPage() {
  return <StoriesScreen />;
}
