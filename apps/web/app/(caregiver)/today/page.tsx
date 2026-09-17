import type { Metadata } from 'next';
import { TodayScreen } from '@/components/schedule/TodayScreen';

export const metadata: Metadata = { title: 'Today', robots: { index: false, follow: false } };

export default function TodayPage() {
  return <TodayScreen />;
}
