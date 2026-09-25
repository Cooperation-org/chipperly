import type { GlobalConfig } from 'payload';
import { signedIn } from '../lib/access';
import { revalidate } from '../lib/revalidate';
import { SOCIAL, SOCIAL_PLATFORMS } from '../lib/social';

const platformOptions = SOCIAL_PLATFORMS.map((p) => ({ label: SOCIAL[p].label, value: p }));

// These codes are pasted into <head> or a <script>, so only the characters
// the services actually use are accepted.
const token = (re: RegExp, what: string) => (v: unknown) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && re.test(v)) ? true : `That does not look like a ${what}.`;

// Site-wide values editors change without a deploy.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Site settings',
  access: { read: () => true, update: signedIn },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'General',
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
          ],
        },
        {
          label: 'Social',
          fields: [
            {
              name: 'social',
              label: 'Follow links',
              type: 'array',
              admin: { description: 'Icon buttons in the footer, in this order. Also listed as sameAs in structured data.' },
              fields: [
                { name: 'platform', type: 'select', required: true, options: platformOptions },
                {
                  name: 'url',
                  type: 'text',
                  required: true,
                  validate: token(/^https:\/\/\S+$/, 'full https:// link'),
                },
              ],
            },
            {
              name: 'share',
              label: 'Share buttons on blog posts',
              type: 'select',
              hasMany: true,
              options: [
                ...platformOptions.filter((o) => ['facebook', 'x', 'linkedin', 'pinterest', 'whatsapp', 'reddit', 'bluesky', 'threads'].includes(o.value)),
                { label: 'Email', value: 'email' },
                { label: 'Copy link', value: 'copy' },
              ],
              admin: { description: 'Leave empty to hide share buttons. On phones a "Share" button opens the phone\'s own share sheet as well.' },
            },
          ],
        },
        {
          label: 'Analytics & search',
          fields: [
            {
              name: 'clarityId',
              label: 'Microsoft Clarity project ID',
              type: 'text',
              validate: token(/^[a-z0-9]{6,16}$/, 'Clarity project ID'),
              admin: { description: 'From clarity.microsoft.com > Settings > Overview, e.g. "abcd1234ef". Empty turns Clarity off. Loads on the public site only, never in the admin.' },
            },
            {
              name: 'googleVerification',
              label: 'Google Search Console verification',
              type: 'text',
              validate: token(/^[\w-]{10,100}$/, 'Google verification code'),
              admin: { description: 'Only the content="..." value of the HTML tag method. Not needed if you verify by DNS.' },
            },
            {
              name: 'bingVerification',
              label: 'Bing Webmaster Tools verification',
              type: 'text',
              validate: token(/^[\w-]{10,100}$/, 'Bing verification code'),
              admin: { description: 'The content="..." value of the msvalidate.01 tag.' },
            },
          ],
        },
      ],
    },
  ],
  hooks: { afterChange: [() => revalidate('/', '/features', '/about', '/blog')] },
};
