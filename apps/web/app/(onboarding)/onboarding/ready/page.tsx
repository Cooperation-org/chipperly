import type { Metadata } from 'next';
import { Ready } from '@/components/onboarding/Ready';

export const metadata: Metadata = { title: 'Ready' };

export default function OnboardingReadyPage() {
  return <Ready />;
}
