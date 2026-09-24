import type { CollectionConfig } from 'payload';
import { slugField } from 'payload';
import { signedIn } from '../lib/access';
import { revalidate } from '../lib/revalidate';

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug'] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea', admin: { description: 'Intro text and meta description for the category page.' } },
    slugField(),
  ],
  hooks: {
    afterChange: [({ doc }) => revalidate('/blog', `/blog/category/${doc.slug}`)],
  },
};
