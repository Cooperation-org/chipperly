import type { Metadata } from 'next';
import { ProfilesScreen } from '@/components/settings/ProfilesScreen';
import { PageHeader } from '@/components/settings/PageHeader';

export const metadata: Metadata = {
  title: 'Profiles',
  robots: { index: false, follow: false },
};

export default function ProfilesPage() {
  return (
    <>
      <PageHeader title="Profiles" backHref="/settings/" />
      <ProfilesScreen />
    </>
  );
}
