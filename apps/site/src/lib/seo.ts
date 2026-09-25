import type { Metadata } from 'next';
import type { Media } from '../payload-types';
import { abs, DEFAULT_DESCRIPTION, SITE_NAME } from './site';

type Seo = {
  title?: string;
  description?: string | null;
  path: string;
  image?: Media | number | null;
  type?: 'website' | 'article';
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noindex?: boolean | null;
};

export function ogImageUrl(image: Media | number | null | undefined, title?: string) {
  if (image && typeof image === 'object') {
    // Resized to share-card width by next/image (Cloudflare Images binding).
    if (image.url) return abs(`/_next/image?url=${encodeURIComponent(image.url)}&w=1200&q=80`);
  }
  return abs(`/og${title ? `?title=${encodeURIComponent(title)}` : ''}`);
}

export function buildMetadata({ title, description, path, image, type = 'website', publishedTime, modifiedTime, noindex }: Seo): Metadata {
  const desc = description || DEFAULT_DESCRIPTION;
  const og = ogImageUrl(image, title);
  return {
    title,
    description: desc,
    alternates: { canonical: abs(path) },
    openGraph: {
      type,
      url: abs(path),
      siteName: SITE_NAME,
      locale: 'en_US',
      title: title ?? SITE_NAME,
      description: desc,
      images: [{ url: og, width: 1200, height: 630, alt: title ?? SITE_NAME }],
      ...(type === 'article' ? { publishedTime: publishedTime ?? undefined, modifiedTime: modifiedTime ?? undefined } : {}),
    },
    twitter: { card: 'summary_large_image', title: title ?? SITE_NAME, description: desc, images: [og] },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}
