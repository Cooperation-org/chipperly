import type { Metadata } from 'next';
import { FirstThenScreen } from '@/components/firstThen/FirstThenScreen';

export const metadata: Metadata = {
  title: 'First-Then',
  robots: { index: false, follow: false },
};

export default function FirstThenPage() {
  return <FirstThenScreen />;
}
