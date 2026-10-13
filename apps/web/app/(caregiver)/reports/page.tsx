import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PersonReport } from '@/components/reports/PersonReport';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Reports', robots: { index: false, follow: false } };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" />
      <Suspense fallback={null}>
        <PersonReport />
      </Suspense>
    </>
  );
}
