import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InviteAccept } from '@/components/auth/InviteAccept';

export const metadata: Metadata = {
  title: 'Accept invite',
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteAccept />
    </Suspense>
  );
}
