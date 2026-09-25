import type { Metadata } from 'next';
import { FeelingsHistory } from '@/components/settings/FeelingsHistory';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Feelings',
  robots: { index: false, follow: false },
};

export default function FeelingsPage() {
  return (
    <>
      <PageHeader title="Feelings" backHref="/settings/" />
      <FeelingsHistory />
    </>
  );
}
