import type { MetadataRoute } from 'next';
import { payload } from '../lib/payload';
import { abs } from '../lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const p = await payload();
  const visible = { _status: { equals: 'published' }, 'meta.noindex': { not_equals: true } } as const;
  const [posts, pages, categories] = await Promise.all([
    p.find({ collection: 'posts', limit: 1000, depth: 0, select: { slug: true, updatedAt: true }, where: visible }),
    p.find({ collection: 'pages', limit: 1000, depth: 0, select: { slug: true, updatedAt: true }, where: visible }),
    p.find({ collection: 'categories', limit: 200, depth: 0, select: { slug: true, updatedAt: true } }),
  ]);
  const newest = posts.docs.reduce((max, d) => (d.updatedAt > max ? d.updatedAt : max), '2026-09-25');

  return [
    { url: abs('/'), lastModified: newest, changeFrequency: 'weekly', priority: 1 },
    { url: abs('/features'), changeFrequency: 'monthly', priority: 0.8 },
    { url: abs('/about'), changeFrequency: 'monthly', priority: 0.6 },
    { url: abs('/blog'), lastModified: newest, changeFrequency: 'weekly', priority: 0.7 },
    ...posts.docs.map((d) => ({ url: abs(`/blog/${d.slug}`), lastModified: d.updatedAt, priority: 0.6 })),
    ...categories.docs.map((d) => ({ url: abs(`/blog/category/${d.slug}`), lastModified: d.updatedAt, priority: 0.4 })),
    ...pages.docs.map((d) => ({ url: abs(`/${d.slug}`), lastModified: d.updatedAt, priority: 0.5 })),
  ];
}
