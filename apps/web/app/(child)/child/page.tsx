import type { Metadata } from 'next';
import { ChildToday } from '@/components/child/ChildToday';

export const metadata: Metadata = { title: 'Today', robots: { index: false, follow: false } };

export default function ChildPage() {
  return <ChildToday />;
}
