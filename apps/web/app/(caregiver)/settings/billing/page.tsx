import type { Metadata } from 'next';
import { BillingPanel } from '@/components/billing/BillingPanel';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Subscription',
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Subscription" backHref="/settings/" />
      <GuestGate><BillingPanel /></GuestGate>
    </>
  );
}
