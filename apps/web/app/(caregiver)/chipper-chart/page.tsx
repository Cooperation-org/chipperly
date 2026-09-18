import type { Metadata } from 'next';
import { ChipperChart } from '@/components/chipperChart/ChipperChart';

export const metadata: Metadata = { title: 'Chipper Chart', robots: { index: false, follow: false } };

export default function ChipperChartPage() {
  return <ChipperChart />;
}
