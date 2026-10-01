import type { Metadata } from 'next';
import { GuideScreen } from '@/components/guide/GuideScreen';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'How to use Chipperly',
  robots: { index: false, follow: false },
};

export default function GuidePage() {
  return (
    <>
      <PageHeader title="How to use Chipperly" backHref="/settings/" />
      <GuideScreen />
    </>
  );
}
