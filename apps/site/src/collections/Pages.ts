import type { CollectionConfig } from 'payload';
import { slugField } from 'payload';
import { signedIn, signedInOrPublished } from '../lib/access';
import { revalidate } from '../lib/revalidate';
import { faqTab } from '../lib/faqField';
import { seoTab } from '../lib/seoFields';

// Free-form pages served at /<slug> (press kit, resources, a landing page
// for a campaign). Home, Features and About are designed pages in code.
export const RESERVED_SLUGS = ['features', 'about', 'blog', 'admin', 'api', 'next', 'waitlist'];

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: { read: signedInOrPublished, create: signedIn, update: signedIn, delete: signedIn },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    preview: (doc) => `/next/preview?path=${encodeURIComponent(`/${doc.slug}`)}`,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'intro', type: 'textarea' },
    {
      type: 'tabs',
      tabs: [{ label: 'Content', fields: [{ name: 'content', type: 'richText', required: true }] }, faqTab, seoTab],
    },
    slugField({
      overrides: (field) => {
        for (const f of field.fields) {
          if ('name' in f && f.name === 'slug' && f.type === 'text') {
            f.validate = (value: unknown) =>
              typeof value === 'string' && RESERVED_SLUGS.includes(value) ? `"${value}" is used by the site.` : true;
          }
        }
        return field;
      },
    }),
  ],
  hooks: {
    afterChange: [({ doc }) => revalidate(`/${doc.slug}`)],
    afterDelete: [({ doc }) => revalidate(`/${doc.slug}`)],
  },
  versions: { drafts: true, maxPerDoc: 20 },
};
