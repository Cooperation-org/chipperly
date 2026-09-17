import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShareViewer } from '@/components/share/ShareViewer';

export const metadata: Metadata = { title: 'Shared', robots: { index: false, follow: false } };

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareViewer />
    </Suspense>
  );
}
