import type { Metadata } from 'next';
import { Suspense } from 'react';
import { KeepCopy } from '@/components/org/KeepCopy';

export const metadata: Metadata = {
  title: 'Keep a copy',
  robots: { index: false, follow: false },
};

export default function KeepPage() {
  return (
    <Suspense fallback={null}>
      <KeepCopy />
    </Suspense>
  );
}
