import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
