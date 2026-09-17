import type { Metadata } from 'next';
import { HistoryScreen } from '@/components/chips/HistoryScreen';

export const metadata: Metadata = {
  title: 'Chip history',
  robots: { index: false, follow: false },
};

export default function ChipHistoryPage() {
  return <HistoryScreen />;
}
