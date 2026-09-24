import { abs, CONTACT_EMAIL, DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from './site';

export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;

export const FEATURES = [
  'Visual schedule',
  'Chip board',
  'Visual timer',
  'First-Then board',
  'Social stories',
  'Shared care team access',
  'Works offline',
];

export function organization(sameAs: string[] = []) {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    legalName: 'Chipperly LLC',
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: abs('/brand/mark.png'), width: 1024, height: 1024 },
    email: CONTACT_EMAIL,
    description: 'Visual supports app for neurodivergent individuals and their families.',
    founder: { '@id': `${SITE_URL}/about#founder` },
    foundingLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: 'Tucson', addressRegion: 'AZ', addressCountry: 'US' },
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export const website = () => ({
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  inLanguage: 'en-US',
  publisher: { '@id': ORG_ID },
});

export const softwareApp = () => ({
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: SITE_NAME,
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  url: `${SITE_URL}/`,
  description: DEFAULT_DESCRIPTION,
  featureList: FEATURES,
  screenshot: ['today', 'chips', 'timer', 'first-then', 'stories'].map((s) => abs(`/screens/${s}.webp`)),
  publisher: { '@id': ORG_ID },
});

export const founder = () => ({
  '@type': 'Person',
  '@id': `${SITE_URL}/about#founder`,
  name: 'Taymar Pixleysmith',
  jobTitle: 'Founder & CEO',
  worksFor: { '@id': ORG_ID },
});

export function breadcrumbs(items: [name: string, path: string][]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', '/'] as [string, string], ...items].map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: abs(path),
    })),
  };
}

export const faqPage = (faqs: { q: string; a: string }[]) => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});
