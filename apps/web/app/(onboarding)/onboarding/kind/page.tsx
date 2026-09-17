import type { Metadata } from 'next';
import { KindPicker } from '@/components/onboarding/KindPicker';

export const metadata: Metadata = { title: 'Who is this for' };

export default function OnboardingKindPage() {
  return <KindPicker />;
}
