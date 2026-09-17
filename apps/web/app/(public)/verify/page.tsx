import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyStatus } from '@/components/auth/VerifyStatus';

export const metadata: Metadata = {
  title: 'Verify email',
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyStatus />
    </Suspense>
  );
}
