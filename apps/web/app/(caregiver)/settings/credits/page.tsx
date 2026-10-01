import type { Metadata } from 'next';
import { ImageCredits } from '@/components/settings/ImageCredits';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Image credits',
  robots: { index: false, follow: false },
};

export default function ImageCreditsPage() {
  return (
    <>
      <PageHeader title="Image credits" backHref="/settings/" />
      <ImageCredits />
    </>
  );
}
