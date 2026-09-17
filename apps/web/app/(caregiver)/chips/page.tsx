import type { Metadata } from 'next';
import { ChipsScreen } from '@/components/chips/ChipsScreen';

export const metadata: Metadata = {
  title: 'Chips',
  robots: { index: false, follow: false },
};

export default function ChipsPage() {
  return <ChipsScreen />;
}
