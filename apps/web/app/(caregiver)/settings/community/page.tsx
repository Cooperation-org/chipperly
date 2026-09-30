import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { CommunitySettings } from './CommunitySettings';

export const metadata: Metadata = {
  title: 'Community',
  robots: { index: false, follow: false },
};

export default function CommunitySettingsPage() {
  return (
    <>
      <PageHeader title="Community" backHref="/settings/" />
      <CommunitySettings />
    </>
  );
}
