import type { Metadata } from 'next';
import { ProfilesScreen } from '@/components/settings/ProfilesScreen';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Profiles',
  robots: { index: false, follow: false },
};

export default function ProfilesPage() {
  return (
    <>
      <PageHeader title="Profiles" backHref="/settings/" />
      <GuestGate><ProfilesScreen /></GuestGate>
    </>
  );
}
