import type { Metadata } from 'next';
import { OrgHome } from '@/components/org/OrgHome';

export const metadata: Metadata = { title: 'Organization', robots: { index: false, follow: false } };

export default function OrgPage() {
  return <OrgHome />;
}
