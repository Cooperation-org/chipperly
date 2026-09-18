import type { Metadata } from 'next';
import { LibraryList } from '@/components/library/LibraryList';
import { PageHeader } from '@/components/settings/PageHeader';

export const metadata: Metadata = {
  title: 'Routines',
  robots: { index: false, follow: false },
};

export default function RoutinesLibraryPage() {
  return (
    <>
      <PageHeader title="Routines" backHref="/settings/" />
      <LibraryList kind="routine" />
    </>
  );
}
