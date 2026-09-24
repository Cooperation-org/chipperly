import type { CollectionConfig } from 'payload';
import { signedIn } from '../lib/access';

// People who asked to hear when Chipperly launches. Written only by the
// server action in app/(site)/actions.ts (overrideAccess), read only by
// signed-in editors. Export to CSV from the list view.
export const Waitlist: CollectionConfig = {
  slug: 'waitlist',
  labels: { singular: 'Waitlist entry', plural: 'Waitlist' },
  access: { read: signedIn, create: () => false, update: signedIn, delete: signedIn },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'role', 'source', 'createdAt'] },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Parent or caregiver', value: 'caregiver' },
        { label: 'Teacher or therapist', value: 'professional' },
        { label: 'Neurodivergent adult', value: 'self' },
        { label: 'Other', value: 'other' },
      ],
    },
    { name: 'source', type: 'text', admin: { readOnly: true, description: 'Page the form was sent from.' } },
  ],
};
