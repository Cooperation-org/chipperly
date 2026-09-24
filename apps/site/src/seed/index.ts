// Seeds an empty CMS: the first admin, blog categories, site settings and
// three starter posts. Safe to rerun: anything that exists is left alone.
//   pnpm -F @chipperly/site seed
// The starter posts are placeholders for the owner to rewrite or unpublish.
import config from '@payload-config';
import { getPayload } from 'payload';
import { POSTS } from './posts';

const payload = await getPayload({ config });

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');

async function findOne<T extends 'users' | 'categories' | 'posts'>(collection: T, field: string, value: string) {
  const { docs } = await payload.find({ collection, where: { [field]: { equals: value } }, limit: 1, depth: 0 });
  return docs[0];
}

const admin =
  (await findOne('users', 'email', email)) ??
  (await payload.create({
    collection: 'users',
    data: { email, password, name: 'The Chipperly team', role: 'Chipperly LLC, Tucson, Arizona' },
  }));

const CATEGORIES = [
  { title: 'Visual supports', slug: 'visual-supports', description: 'How picture schedules, timers, token boards and first-then boards help, and how to use them well.' },
  { title: 'Routines & transitions', slug: 'routines', description: 'Ideas for mornings, bedtimes, leaving the house and every change in between.' },
  { title: 'Company news', slug: 'news', description: 'Updates from the Chipperly team: launches, new features and what we are working on.' },
];
const cats: Record<string, number> = {};
for (const c of CATEGORIES) {
  const doc = (await findOne('categories', 'slug', c.slug)) ?? (await payload.create({ collection: 'categories', data: c }));
  cats[c.slug] = doc.id;
}

await payload.updateGlobal({
  slug: 'settings',
  data: { contactEmail: 'info@chipperlyapp.com', launched: false, announcement: { enabled: false } },
});

for (const post of POSTS) {
  if (await findOne('posts', 'slug', post.slug)) continue;
  await payload.create({
    collection: 'posts',
    data: {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      categories: post.categories.map((c) => cats[c]),
      authors: [admin.id],
      publishedAt: post.publishedAt,
      _status: 'published',
    },
  });
}

payload.logger.info(`Seeded. Admin: ${email}`);
process.exit(0);
