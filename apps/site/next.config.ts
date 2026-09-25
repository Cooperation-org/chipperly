import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

// Gives `next dev` the same bindings as the Worker so getCloudflareContext()
// works in development. Always the local D1/R2 under .wrangler/state:
// remoteBindings must stay false, or dev would read and write the live site.
initOpenNextCloudflareForDev({ remoteBindings: false });

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }, { pathname: '/screens/**' }, { pathname: '/brand/**' }],
  },
  // Packages with workerd-specific code (https://opennext.js.org/cloudflare/howtos/workerd).
  serverExternalPackages: ['jose', 'pg-cloudflare'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return webpackConfig;
  },
  turbopack: { root: path.resolve(dirname, '../..') },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
