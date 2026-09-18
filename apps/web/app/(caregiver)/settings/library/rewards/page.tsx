import type { Metadata } from 'next';
import { LibraryList } from '@/components/library/LibraryList';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Rewards',
  robots: { index: false, follow: false },
};

export default function RewardsLibraryPage() {
  return (
    <>
      <PageHeader title="Rewards" backHref="/settings/" />
      <LibraryList kind="reward" />
    </>
  );
}
