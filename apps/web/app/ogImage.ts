const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * A page's `openGraph` replaces the root layout's rather than merging into it,
 * so every page that declares one has to carry the image or its link preview
 * loses it. metadataBase resolves this against NEXT_PUBLIC_SITE_ORIGIN.
 */
export const OG_IMAGES = [
  {
    url: `${basePath}/og/og-image.png`,
    width: 1200,
    height: 630,
    alt: 'Chipperly. Neurodivergent life made easier.',
  },
];
