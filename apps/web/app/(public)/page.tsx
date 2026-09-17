import type { Metadata } from 'next';
import { SignInForm } from '@/components/auth/SignInForm';

const description = 'Visual supports for the whole care team: schedules, chips, timers, first-then boards and social stories.';

// No title override: root layout's default "Chipperly" is exactly right for
// the homepage (a title here would run through the "%s · Chipperly" template).
// (public)/layout.tsx already sets metadata.verification.google for the whole group.
export const metadata: Metadata = {
  description,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Chipperly',
    description,
    url: '/',
    type: 'website',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Chipperly',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  description,
};

export default function WelcomePage() {
  return (
    <>
      {/* Static JSON-LD, no user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SignInForm />
    </>
  );
}
