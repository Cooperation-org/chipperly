import type { CollectionConfig } from 'payload';
import { signedIn } from '../lib/access';

// Addresses that must never get a newsletter again. Filled by the
// unsubscribe link (app/unsubscribe/route.ts); editors can also add one by
// hand, e.g. when someone replies "please stop". Every send checks this list.
export const Unsubscribes: CollectionConfig = {
  slug: 'unsubscribes',
  labels: { singular: 'Unsubscribe', plural: 'Unsubscribes' },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'source', 'createdAt'] },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'source', type: 'text', admin: { description: 'How they opted out: "link" or a note.' } },
  ],
  hooks: {
    beforeValidate: [({ data }) => (data?.email ? { ...data, email: String(data.email).trim().toLowerCase() } : data)],
  },
};
