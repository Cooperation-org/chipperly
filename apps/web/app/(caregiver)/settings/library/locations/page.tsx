import type { Metadata } from 'next';
import { LibraryList } from '@/components/library/LibraryList';
import { PageHeader } from '@/components/settings/PageHeader';

export const metadata: Metadata = {
  title: 'Locations',
  robots: { index: false, follow: false },
};

export default function LocationsLibraryPage() {
  return (
    <>
      <PageHeader title="Locations" backHref="/settings/" />
      <LibraryList kind="location" />
    </>
  );
}
