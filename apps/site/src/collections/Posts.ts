import type { CollectionAfterChangeHook, CollectionConfig, FieldHook } from 'payload';
import { slugField } from 'payload';
import { signedIn, signedInOrPublished } from '../lib/access';
import { revalidate } from '../lib/revalidate';
import { faqTab } from '../lib/faqField';
import { seoTab } from '../lib/seoFields';
import { abs } from '../lib/site';

const stampPublishedAt: FieldHook = ({ siblingData, value }) =>
  siblingData._status === 'published' && !value ? new Date().toISOString() : value;

// Ticking "Email this to subscribers" on a published post makes a draft
// newsletter from it (once). Nothing is sent: an editor opens it under
// Newsletters, checks it and sends.
const draftNewsletter: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (!doc.emailSubscribers || doc._status !== 'published') return doc;
  const made = await req.payload.count({ collection: 'newsletters', where: { sourcePost: { equals: doc.id } }, overrideAccess: true });
  if (made.totalDocs) return doc;
  await req.payload.create({
    collection: 'newsletters',
    data: { subject: doc.title, body: `${doc.excerpt}

Read it here: ${abs(`/blog/${doc.slug}`)}`, audience: 'all', status: 'draft', sourcePost: doc.id },
    overrideAccess: true,
  });
  return doc;
};

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  access: { read: signedInOrPublished, create: signedIn, update: signedIn, delete: signedIn },
  defaultPopulate: { title: true, slug: true, excerpt: true, heroImage: true, publishedAt: true, categories: true },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', '_status', 'publishedAt'],
    preview: (doc) => `/next/preview?path=${encodeURIComponent(`/blog/${doc.slug}`)}`,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
      maxLength: 300,
      admin: { description: 'One or two sentences for the blog list and the default meta description.' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'heroImage', type: 'upload', relationTo: 'media' },
            { name: 'content', type: 'richText', required: true },
          ],
        },
        faqTab,
        seoTab,
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
      hooks: { beforeChange: [stampPublishedAt] },
    },
    {
      name: 'emailSubscribers',
      label: 'Email this to subscribers',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'When published, makes a draft in Newsletters. Nothing is sent until you send it there.' },
    },
    { name: 'authors', type: 'relationship', relationTo: 'users', hasMany: true, admin: { position: 'sidebar' } },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true, admin: { position: 'sidebar' } },
    {
      name: 'relatedPosts',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      admin: { position: 'sidebar' },
      filterOptions: ({ id }) => ({ id: { not_in: [id] } }),
    },
    // Public copy of each author's byline, filled on read (see hook below).
    {
      name: 'byline',
      type: 'json',
      virtual: true,
      admin: { hidden: true },
    },
    slugField(),
  ],
  hooks: {
    afterRead: [
      async ({ doc, req }) => {
        const ids = (doc.authors ?? []).map((a: number | { id: number }) => (typeof a === 'object' ? a.id : a));
        if (!ids.length) return doc;
        const { docs } = await req.payload.find({
          collection: 'users',
          where: { id: { in: ids } },
          depth: 1,
          overrideAccess: true,
          req,
        });
        doc.byline = docs.map((u) => ({ id: u.id, name: u.name, role: u.role, bio: u.bio, avatar: u.avatar }));
        doc.authors = ids;
        return doc;
      },
    ],
    afterChange: [({ doc }) => revalidate('/', '/blog', `/blog/${doc.slug}`), draftNewsletter],
    afterDelete: [({ doc }) => revalidate('/', '/blog', `/blog/${doc.slug}`)],
  },
  versions: {
    drafts: { schedulePublish: true },
    maxPerDoc: 30,
  },
};
