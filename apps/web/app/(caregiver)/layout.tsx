import type { Metadata } from 'next';
import { RequireSession } from '@/lib/auth/RequireSession';
import { CaregiverShell } from '@/components/shell/CaregiverShell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <CaregiverShell>{children}</CaregiverShell>
    </RequireSession>
  );
}
