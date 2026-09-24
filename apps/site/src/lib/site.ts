// Public origin of the marketing site. Every canonical URL, sitemap entry and
// JSON-LD id is built from this, so it must be the production domain in prod.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100').replace(/\/$/, '');

// The web app. "Try the app" and "Sign in" link here.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://demos.linkedtrust.us/chipperly-next').replace(/\/$/, '');

export const SITE_NAME = 'Chipperly';
export const TAGLINE = 'Neurodivergent life made easier.';
export const DEFAULT_DESCRIPTION =
  'Visual schedules, timers, chip boards, first-then and social stories in one simple app for neurodivergent individuals and the families who support them.';
export const CONTACT_EMAIL = 'info@chipperlyapp.com';

export const abs = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
