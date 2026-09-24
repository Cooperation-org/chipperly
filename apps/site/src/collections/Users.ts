import type { CollectionConfig } from 'payload';
import { signedIn } from '../lib/access';

// Editors of the marketing site. Their name and bio appear as the byline on
// posts, so readers (and search engines) see who wrote what.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'email', 'updatedAt'] },
  auth: { useAPIKey: false, maxLoginAttempts: 5, lockTime: 10 * 60 * 1000 },
  // Private: posts copy the byline fields they need (Posts populateAuthors),
  // so editor emails never leave the admin.
  access: { read: signedIn },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', admin: { description: 'Shown under the byline, e.g. "Founder & CEO".' } },
    { name: 'bio', type: 'textarea' },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
  ],
};
