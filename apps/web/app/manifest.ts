import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function manifest(): MetadataRoute.Manifest {
  const scope = `${basePath}/`;
  return {
    name: 'Chipperly',
    short_name: 'Chipperly',
    description: 'Visual supports for the whole care team.',
    start_url: scope,
    scope,
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#1F6F78',
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${basePath}/icons/icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
