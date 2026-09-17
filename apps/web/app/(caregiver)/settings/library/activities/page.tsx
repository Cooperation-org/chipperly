import type { Metadata } from 'next';
import { LibraryList } from '@/components/library/LibraryList';
import { PageHeader } from '@/components/settings/PageHeader';

export const metadata: Metadata = {
  title: 'Activities',
  robots: { index: false, follow: false },
};

export default function ActivitiesLibraryPage() {
  return (
    <>
      <PageHeader title="Activities" backHref="/settings/" />
      <LibraryList kind="activity" />
    </>
  );
}
