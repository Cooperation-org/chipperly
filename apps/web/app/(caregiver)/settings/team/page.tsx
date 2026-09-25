import type { Metadata } from 'next';
import { CareTeamScreen } from '@/components/careTeam/CareTeamScreen';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Care team',
  robots: { index: false, follow: false },
};

export default function CareTeamPage() {
  return (
    <>
      <PageHeader title="Care team" backHref="/settings/" />
      <CareTeamScreen />
    </>
  );
}
