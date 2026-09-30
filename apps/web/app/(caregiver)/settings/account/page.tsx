import type { Metadata } from 'next';
import { AccountScreen } from '@/components/settings/AccountScreen';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account" backHref="/settings/" />
      <GuestGate><AccountScreen /></GuestGate>
    </>
  );
}
