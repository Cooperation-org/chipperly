import type { Metadata } from 'next';
import { ChildShell } from '@/components/shell/ChildShell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ChildLayout({ children }: { children: React.ReactNode }) {
  return <ChildShell>{children}</ChildShell>;
}
