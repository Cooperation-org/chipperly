import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// ponytail: only the truly public, indexable routes. The other (public)
// pages (forgot/reset-password, verify, invite, share) carry tokens or
// forms and are not meant to rank; add here if marketing wants them listed.
const PUBLIC_ROUTES = ['/', '/sign-up/'];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${siteOrigin}${basePath}${route}`,
    lastModified,
  }));
}
