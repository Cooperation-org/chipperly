import type { Payload } from 'payload';
import { APP_URL } from './site';
import { type Audience, fetchAppUsers, pickAudience, type Recipient } from './audience';
import { buildMail, sendBatch } from './newsletterMail';

export type SendLogEntry = { at: string; kind: 'test' | 'send'; audience: string; sent: number; skipped: number; failed: number };

async function loadRecipients(p: Payload, audience: Audience): Promise<Recipient[]> {
  const out: Recipient[] = [];
  if (audience === 'all' || audience === 'waitlist') {
    const { docs } = await p.find({ collection: 'waitlist', pagination: false, depth: 0, select: { email: true }, overrideAccess: true });
    out.push(...docs.map((d) => ({ email: d.email, segment: 'waitlist' as const })));
  }
  if (audience !== 'waitlist') out.push(...(await fetchAppUsers(APP_URL, process.env.NEWSLETTER_API_SECRET)));
  return out;
}

/**
 * Sends one newsletter, to the audience or (testTo) to a single address.
 * Throws a plain-English Error when it cannot start: no mail key, or an
 * audience that is not connected. Unsubscribed addresses are always dropped.
 */
export async function sendNewsletter(p: Payload, n: { subject: string; body: string; audience: Audience }, testTo?: string): Promise<SendLogEntry> {
  const apiKey = process.env.RESEND_API_KEY;
  const secret = process.env.PAYLOAD_SECRET ?? '';
  if (!apiKey) throw new Error('Email sending is not set up yet (RESEND_API_KEY is missing on the site).');

  let to: string[];
  let skipped = 0;
  if (testTo) {
    to = [testTo.toLowerCase()];
  } else {
    const recipients = await loadRecipients(p, n.audience);
    const { docs } = await p.find({ collection: 'unsubscribes', pagination: false, depth: 0, select: { email: true }, overrideAccess: true });
    to = pickAudience(n.audience, recipients, new Set(docs.map((d) => d.email.toLowerCase())));
    skipped = pickAudience(n.audience, recipients, new Set()).length - to.length;
  }
  const mails = await Promise.all(to.map((email) => buildMail({ to: email, subject: n.subject, body: n.body, secret })));
  const { sent, failed } = await sendBatch(mails, { apiKey, from: process.env.MAIL_FROM || 'Chipperly <no-reply@chipperlyapp.com>' });
  return { at: new Date().toISOString(), kind: testTo ? 'test' : 'send', audience: n.audience, sent, skipped, failed };
}
