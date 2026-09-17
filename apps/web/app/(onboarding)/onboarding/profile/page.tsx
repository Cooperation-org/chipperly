import type { Metadata } from 'next';
import { ProfileForm } from '@/components/onboarding/ProfileForm';

export const metadata: Metadata = { title: 'Who is this for' };

export default function OnboardingProfilePage() {
  return <ProfileForm />;
}
