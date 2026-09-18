import type { Metadata } from 'next';
import { SettingsMenu } from '@/components/settings/SettingsMenu';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" backHref="/today/" />
      <SettingsMenu />
    </>
  );
}
