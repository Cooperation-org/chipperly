import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = {
  title: 'Send feedback',
  robots: { index: false, follow: false },
};

export default function FeedbackPage() {
  return (
    <>
      <PageHeader title="Send feedback" backHref="/settings/" />
      <FeedbackForm />
    </>
  );
}
