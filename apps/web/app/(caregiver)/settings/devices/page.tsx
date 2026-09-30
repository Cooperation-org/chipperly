import type { Metadata } from 'next';
import { DevicesScreen } from '@/components/settings/DevicesScreen';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Devices',
  robots: { index: false, follow: false },
};

export default function DevicesPage() {
  return (
    <>
      <PageHeader title="Devices" backHref="/settings/" />
      <GuestGate><DevicesScreen /></GuestGate>
    </>
  );
}
