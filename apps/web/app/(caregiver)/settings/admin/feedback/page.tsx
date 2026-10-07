import type { Metadata } from 'next';
import { FeedbackInbox } from '@/components/admin/FeedbackInbox';
import { GuestGate } from '@/components/auth/GuestGate';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Feedback inbox',
  robots: { index: false, follow: false },
};

export default function FeedbackInboxPage() {
  return (
    <>
      <PageHeader title="Feedback inbox" backHref="/settings/" />
      <GuestGate><FeedbackInbox /></GuestGate>
    </>
  );
}
