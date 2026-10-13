import type { Metadata } from 'next';
import { OrgReport } from '@/components/reports/OrgReport';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'People report', robots: { index: false, follow: false } };

export default function OrgReportsPage() {
  return (
    <>
      <PageHeader title="Report" />
      <OrgReport />
    </>
  );
}
