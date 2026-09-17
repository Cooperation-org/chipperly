import type { Metadata } from 'next';
import { SignUpForm } from '@/components/auth/SignUpForm';

const description = 'Create a Chipperly account to build visual schedules, chip boards and social stories for your family or team.';

export const metadata: Metadata = {
  title: 'Create account',
  description,
  alternates: { canonical: '/sign-up/' },
  openGraph: {
    title: 'Create account · Chipperly',
    description,
    url: '/sign-up/',
    type: 'website',
  },
};

export default function SignUpPage() {
  return <SignUpForm />;
}
