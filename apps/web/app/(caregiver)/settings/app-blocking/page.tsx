import type { Metadata } from 'next';
import { AppBlockingScreen } from '@/components/settings/AppBlockingScreen';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'App blocking',
  robots: { index: false, follow: false },
};

export default function AppBlockingPage() {
  return (
    <>
      <PageHeader title="App blocking" backHref="/settings/" />
      <AppBlockingScreen />
    </>
  );
}
