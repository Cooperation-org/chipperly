import type { Metadata } from 'next';
import { OrgSetup } from '@/components/onboarding/OrgSetup';

export const metadata: Metadata = { title: 'Set up your organization' };

export default function OnboardingOrgPage() {
  return <OrgSetup />;
}
