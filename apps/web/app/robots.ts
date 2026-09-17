import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/today/',
        '/chips/',
        '/timer/',
        '/first-then/',
        '/stories/',
        '/settings/',
        '/activity/',
        '/reward/',
        '/story/',
        '/child/',
        '/share/',
        '/onboarding/',
        '/api/',
      ],
    },
    sitemap: `${siteOrigin}${basePath}/sitemap.xml`,
  };
}
