import type { Metadata } from 'next';
import { BackupsPanel } from '@/components/admin/BackupsPanel';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Backups',
  robots: { index: false, follow: false },
};

export default function BackupsPage() {
  return (
    <>
      <PageHeader title="Backups" backHref="/settings/" />
      <GuestGate><BackupsPanel /></GuestGate>
    </>
  );
}
