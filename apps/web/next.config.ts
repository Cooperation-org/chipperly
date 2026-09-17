import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

/**
 * Every `app/**\/page.tsx` becomes a precached route url, e.g.
 * `app/(caregiver)/today/page.tsx` -> `/today/`. Route groups (parens)
 * are stripped; the file must exist (feature agents add pages over time),
 * so this walk tolerates an app/ tree with none yet.
 */
function pageRouteUrls(dir: string, appRoot: string): string[] {
  const urls: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return urls;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      urls.push(...pageRouteUrls(full, appRoot));
    } else if (entry === 'page.tsx') {
      const relDir = path.relative(appRoot, dir).split(path.sep).filter(Boolean);
      const segments = relDir.filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')));
      const url = `/${segments.join('/')}${segments.length > 0 ? '/' : ''}`;
      urls.push(url);
    }
  }
  return urls;
}

function additionalPrecacheEntries(): { url: string; revision: string }[] {
  const appRoot = path.join(process.cwd(), 'app');
  const revision = process.env.GIT_SHA ?? 'dev';
  const prefix = basePath ?? '';
  return pageRouteUrls(appRoot, appRoot).map((url) => ({ url: `${prefix}${url}`, revision }));
}

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath,
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  register: false,
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: additionalPrecacheEntries(),
});

export default withSerwist(nextConfig);
