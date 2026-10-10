import type { Metadata } from 'next';
import { PaymentsLog } from '@/components/admin/PaymentsLog';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Payments log',
  robots: { index: false, follow: false },
};

export default function PaymentsLogPage() {
  return (
    <>
      <PageHeader title="Payments log" backHref="/settings/" />
      <GuestGate><PaymentsLog /></GuestGate>
    </>
  );
}
