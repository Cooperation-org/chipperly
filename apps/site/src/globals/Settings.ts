import type { GlobalConfig } from 'payload';
import { signedIn } from '../lib/access';
import { revalidate } from '../lib/revalidate';

// Site-wide values editors change without a deploy.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Site settings',
  access: { read: () => true, update: signedIn },
  fields: [
    {
      name: 'announcement',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox' },
        { name: 'text', type: 'text' },
        { name: 'link', type: 'text', admin: { description: 'Relative (/blog/...) or full URL.' } },
      ],
    },
    {
      name: 'launched',
      type: 'checkbox',
      label: 'App is open to the public',
      admin: { description: 'Off: the main button is "Join the waitlist". On: it is "Get started" and goes to app sign-up.' },
    },
    { name: 'contactEmail', type: 'email', defaultValue: 'info@chipperlyapp.com' },
    {
      name: 'social',
      type: 'array',
      admin: { description: 'Profiles linked in the footer and listed as sameAs in structured data.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
  ],
  hooks: { afterChange: [() => revalidate('/', '/features', '/about', '/blog')] },
};
