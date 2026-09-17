import type { Metadata } from 'next';
import { AttitudeHistory } from '@/components/settings/AttitudeHistory';
import { PageHeader } from '@/components/settings/PageHeader';

export const metadata: Metadata = {
  title: 'Attitude history',
  robots: { index: false, follow: false },
};

export default function AttitudeHistoryPage() {
  return (
    <>
      <PageHeader title="Attitude history" backHref="/settings/" />
      <AttitudeHistory />
    </>
  );
}
