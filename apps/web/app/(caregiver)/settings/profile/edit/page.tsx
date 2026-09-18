import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EditProfileClient } from './EditProfileClient';

export const metadata: Metadata = {
  title: 'Edit profile',
  robots: { index: false, follow: false },
};

export default function EditProfilePage() {
  return (
    <>
      <PageHeader title="Edit profile" backHref="/settings/" />
      <Suspense>
        <EditProfileClient />
      </Suspense>
    </>
  );
}
