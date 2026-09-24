import type { MetadataRoute } from 'next';
import { abs } from '../lib/site';

// Everything public is marketing content, and AI crawlers are welcome (same
// policy as the previous site): we want Chipperly to be findable and citable.
// Only the admin, the API and the preview endpoints are closed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/next/'] }],
    sitemap: abs('/sitemap.xml'),
    host: abs('/'),
  };
}
