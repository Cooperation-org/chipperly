import type { Metadata } from 'next';
import { GroupsScreen } from '@/components/org/GroupsScreen';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Groups', robots: { index: false, follow: false } };

export default function GroupsPage() {
  return (
    <>
      <PageHeader title="Groups" backHref="/org/" />
      <GroupsScreen />
    </>
  );
}
