import type { Metadata } from 'next';
import { DeviceRoleStep } from '@/components/onboarding/DeviceRoleStep';

export const metadata: Metadata = { title: 'This device' };

export default function OnboardingDevicePage() {
  return <DeviceRoleStep />;
}
