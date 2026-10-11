import type { Metadata } from 'next';
import { SyncHealthPanel } from '@/components/admin/SyncHealthPanel';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Sync health',
  robots: { index: false, follow: false },
};

export default function SyncHealthPage() {
  return (
    <>
      <PageHeader title="Sync health" backHref="/settings/" />
      <GuestGate><SyncHealthPanel /></GuestGate>
    </>
  );
}
