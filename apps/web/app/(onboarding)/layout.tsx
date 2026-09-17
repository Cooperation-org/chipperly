import type { Metadata } from 'next';
import { RequireSession } from '@/lib/auth/RequireSession';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
