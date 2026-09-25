import { APIError, type CollectionConfig } from 'payload';
import { signedIn } from '../lib/access';
import { CATCH_ALL, deleteRule, emailConfig, ensureDestination, upsertRule, validLocalPart } from '../lib/emailRouting';

type Extra = { email?: string | null };

// Team addresses at @chipperlyapp.com that forward to people's own inboxes
// (Cloudflare Email Routing). Saving here updates Cloudflare right away.
export const EmailAddresses: CollectionConfig = {
  slug: 'email-addresses',
  labels: { singular: 'Email address', plural: 'Email addresses' },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  admin: {
    useAsTitle: 'address',
    defaultColumns: ['address', 'destination', 'status', 'enabled'],
    description:
      'Forwarding addresses at @chipperlyapp.com. Mail sent to the address arrives in the destination inbox. A new destination gets a verification email from Cloudflare and must click it once; then open the address and press Save to switch it on. Use * as the name for the catch-all (any other address).',
  },
  fields: [
    {
      name: 'localPart',
      label: 'Name (before the @)',
      type: 'text',
      required: true,
      unique: true,
      validate: (v: unknown) => (validLocalPart(v) ? true : 'Lowercase letters, numbers, dots or dashes, e.g. "info" or "first.last". Use * for the catch-all.'),
      admin: { description: 'e.g. info, support, taymar. * = every other address.' },
    },
    { name: 'destination', label: 'Forward to', type: 'email', required: true },
    {
      name: 'alsoForwardTo',
      label: 'Also forward to',
      type: 'array',
      labels: { singular: 'Recipient', plural: 'Recipients' },
      admin: { description: 'Extra people who get a copy, e.g. info@ to both the founder and support. Each must verify once, like the main destination.' },
      fields: [{ name: 'email', type: 'email', required: true }],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'note', type: 'text', admin: { description: 'Who or what this address is for.' } },
    // Shown in the list; filled from Cloudflare on save.
    {
      name: 'address',
      type: 'text',
      admin: { readOnly: true },
      hooks: {
        beforeChange: [({ siblingData }) => (siblingData.localPart === CATCH_ALL ? 'Any other address (catch-all)' : `${siblingData.localPart}@chipperlyapp.com`)],
      },
    },
    {
      name: 'status',
      type: 'select',
      admin: {
        readOnly: true,
        description: 'Waiting: the destination has been sent a verification email by Cloudflare. After they click it, open this address and press Save to switch it on.',
      },
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Waiting for destination to verify', value: 'pending' },
        { label: 'Disabled', value: 'disabled' },
        { label: 'Not synced (Cloudflare not configured)', value: 'not-synced' },
      ],
    },
    { name: 'ruleId', type: 'text', admin: { hidden: true } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc }) => {
        const localPart = String(data.localPart ?? originalDoc?.localPart ?? '');
        const destination = String(data.destination ?? originalDoc?.destination ?? '');
        const enabled = data.enabled ?? originalDoc?.enabled ?? true;
        const extras = ((data.alsoForwardTo ?? originalDoc?.alsoForwardTo ?? []) as Extra[])
          .map((e) => (e.email ?? '').trim().toLowerCase())
          .filter((e) => e && e !== destination.trim().toLowerCase());
        if (!emailConfig()) return { ...data, status: 'not-synced' };
        try {
          const states = await Promise.all([destination, ...new Set(extras)].map((d) => ensureDestination(d)));
          // Cloudflare refuses rules for unverified destinations. Keep the
          // entry as pending; saving it again after the clicks activates it.
          if (states.some((v) => v !== 'verified')) return { ...data, status: 'pending' };
          const ruleId = await upsertRule({ localPart, destination, enabled, fanout: extras.length > 0 }, originalDoc?.ruleId);
          return { ...data, ruleId, status: enabled ? 'active' : 'disabled' };
        } catch (err) {
          throw new APIError(err instanceof Error ? err.message : 'Could not update Cloudflare.', 502, undefined, true);
        }
      },
    ],
    afterDelete: [
      async ({ doc }) => {
        await deleteRule(doc.localPart, doc.ruleId);
      },
    ],
  },
};
