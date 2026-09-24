import config from '@payload-config';
import { draftMode } from 'next/headers';
import { permanentRedirect, redirect } from 'next/navigation';
import { getPayload } from 'payload';
import { cache } from 'react';

export const payload = () => getPayload({ config });

export const getSettings = cache(async () => (await payload()).findGlobal({ slug: 'settings', depth: 0 }));

export const POSTS_PER_PAGE = 9;

export async function getPosts({ page = 1, category }: { page?: number; category?: number } = {}) {
  return (await payload()).find({
    collection: 'posts',
    depth: 1,
    limit: POSTS_PER_PAGE,
    page,
    sort: '-publishedAt',
    where: {
      _status: { equals: 'published' },
      ...(category ? { categories: { contains: category } } : {}),
    },
  });
}

export const getPost = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const { docs } = await (await payload()).find({
    collection: 'posts',
    depth: 2,
    limit: 1,
    draft,
    overrideAccess: draft,
    where: { slug: { equals: slug } },
  });
  return docs[0] ?? null;
});

export const getPage = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const { docs } = await (await payload()).find({
    collection: 'pages',
    depth: 1,
    limit: 1,
    draft,
    overrideAccess: draft,
    where: { slug: { equals: slug } },
  });
  return docs[0] ?? null;
});

export const getCategory = cache(async (slug: string) => {
  const { docs } = await (await payload()).find({ collection: 'categories', limit: 1, where: { slug: { equals: slug } } });
  return docs[0] ?? null;
});

// Editors manage redirects in the admin (Settings > Redirects). Called by
// the catch-all routes before they give up with a 404.
export async function followRedirect(path: string) {
  const { docs } = await (await payload()).find({
    collection: 'redirects',
    depth: 1,
    limit: 1,
    where: { from: { equals: path } },
  });
  const r = docs[0];
  if (!r?.to) return;
  let to = r.to.url ?? '';
  if (r.to.type === 'reference' && r.to.reference && typeof r.to.reference.value === 'object') {
    const { relationTo, value } = r.to.reference;
    to = `${relationTo === 'posts' ? '/blog' : ''}/${value.slug}`;
  }
  if (!to) return;
  if (r.type === '302') redirect(to);
  permanentRedirect(to);
}
