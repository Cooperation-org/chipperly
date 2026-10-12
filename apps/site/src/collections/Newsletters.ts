import { APIError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload';
import { signedIn } from '../lib/access';
import { AUDIENCES, type Audience } from '../lib/audience';
import { type SendLogEntry, sendNewsletter } from '../lib/newsletterSend';

type Doc = { subject?: string; body?: string; audience?: Audience; status?: string; sendLog?: SendLogEntry[] | null };

// The "action" is two checkboxes: tick one, press Save, and the hook below
// does it and unticks it. Keeps the admin plain Payload, no custom UI.
const act: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const { sendTest, sendNow } = data;
  data.sendTest = false;
  data.sendNow = false;
  if (!sendTest && !sendNow) return data;

  const n: Doc = { ...originalDoc, ...data };
  if (!n.subject || !n.body) throw new APIError('Add a subject and a body first.', 400, undefined, true);
  if (sendNow && originalDoc?.status === 'sent') throw new APIError('This newsletter was already sent.', 400, undefined, true);
  if (sendTest && !req.user?.email) throw new APIError('Sign in to send a test.', 400, undefined, true);

  try {
    const entry = await sendNewsletter(req.payload, { subject: n.subject, body: n.body, audience: n.audience ?? 'waitlist' }, sendTest ? req.user!.email : undefined);
    data.sendLog = [...(n.sendLog ?? []), entry];
    if (sendNow) {
      data.status = 'sent';
      data.sentAt = entry.at;
    }
  } catch (err) {
    throw new APIError(err instanceof Error ? err.message : 'Sending failed.', 400, undefined, true);
  }
  return data;
};

// Email to waitlist and app users. Write in plain text, pick who gets it,
// press Save with "Send a test to me" ticked, then "Send now". A scheduled
// one goes out with the site's daily cron (worker.js). Every email carries
// an unsubscribe link, and addresses on the Unsubscribes list are skipped.
export const Newsletters: CollectionConfig = {
  slug: 'newsletters',
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  admin: { useAsTitle: 'subject', defaultColumns: ['subject', 'audience', 'status', 'sentAt'] },
  fields: [
    { name: 'subject', type: 'text', required: true },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      admin: { rows: 14, description: 'Plain text. A blank line starts a new paragraph. Links become clickable. The unsubscribe footer is added for you.' },
    },
    {
      name: 'audience',
      type: 'select',
      required: true,
      defaultValue: 'waitlist',
      options: [...AUDIENCES],
      admin: { description: 'App segments need the app connected (NEWSLETTER_API_SECRET); until then they say "not connected yet".' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Sent', value: 'sent' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'scheduledFor',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, condition: (d) => d.status === 'scheduled', description: 'Goes out with the daily send, the next morning after this time.' },
    },
    { name: 'sendTest', label: 'Send a test to me when I save', type: 'checkbox', defaultValue: false },
    { name: 'sendNow', label: 'Send to the audience when I save', type: 'checkbox', defaultValue: false },
    { name: 'sentAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'sourcePost', type: 'relationship', relationTo: 'posts', admin: { position: 'sidebar', readOnly: true, description: 'The blog post this was made from.' } },
    {
      name: 'sendLog',
      type: 'array',
      admin: { readOnly: true, description: 'Every test and send, newest last.' },
      fields: [
        { name: 'at', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'kind', type: 'select', options: ['test', 'send'] },
        { name: 'audience', type: 'text' },
        { name: 'sent', type: 'number' },
        { name: 'skipped', type: 'number', admin: { description: 'Unsubscribed, not emailed.' } },
        { name: 'failed', type: 'number' },
      ],
    },
  ],
  hooks: { beforeChange: [act] },
  endpoints: [
    {
      // Called by the daily cron (worker.js) with the CRON_SECRET.
      path: '/send-due',
      method: 'post',
      handler: async (req) => {
        if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) return Response.json({ error: 'forbidden' }, { status: 403 });
        const { docs } = await req.payload.find({
          collection: 'newsletters',
          where: { status: { equals: 'scheduled' }, scheduledFor: { less_than_equal: new Date().toISOString() } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        });
        const done: { id: number; sent?: number; error?: string }[] = [];
        for (const n of docs) {
          try {
            const entry = await sendNewsletter(req.payload, n);
            await req.payload.update({ collection: 'newsletters', id: n.id, data: { status: 'sent', sentAt: entry.at, sendLog: [...(n.sendLog ?? []), entry] }, overrideAccess: true });
            done.push({ id: n.id, sent: entry.sent });
          } catch (err) {
            done.push({ id: n.id, error: String(err) });
          }
        }
        return Response.json({ done });
      },
    },
  ],
};
