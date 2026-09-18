import type { Metadata } from 'next';
import { FirstProfileForm } from '@/components/onboarding/FirstProfileForm';

export const metadata: Metadata = { title: 'Who is this for' };

export default function OnboardingProfilePage() {
  return <FirstProfileForm />;
}
