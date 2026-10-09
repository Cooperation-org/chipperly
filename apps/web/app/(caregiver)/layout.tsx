import type { Metadata } from 'next';
import { RequireSession } from '@/lib/auth/RequireSession';
import { CaregiverShell } from '@/components/shell/CaregiverShell';
import { LapseBanner } from '@/components/billing/LapseBanner';
import { NpsPrompt } from '@/components/feedback/NpsPrompt';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <CaregiverShell>
        {/* Caregiver side only: the child shell never shows billing state. Renders
            nothing unless Stripe is configured and the account has actually lapsed. */}
        <LapseBanner />
        <NpsPrompt />
        {children}
      </CaregiverShell>
    </RequireSession>
  );
}
