import type { Metadata } from 'next';
import { CareTeamScreen } from '@/components/careTeam/CareTeamScreen';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" backHref="/settings/" />
      <CareTeamScreen />
    </>
  );
}
