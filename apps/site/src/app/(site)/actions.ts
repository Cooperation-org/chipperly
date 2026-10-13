'use server';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';
import { payload } from '../../lib/payload';
import { sendBatch } from '../../lib/newsletterMail';
import { SITE_URL } from '../../lib/site';
import { checkWaitlist, type WaitlistState } from '../../lib/waitlist';
import { welcomeMail } from '../../lib/waitlistWelcome';

// Per-IP limit. On Cloudflare the WAITLIST_LIMITER binding (wrangler.jsonc)
// counts across every Worker instance; the in-memory map is only the
// fallback when the binding is missing (plain Node).
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

async function limited(ip: string) {
  try {
    const limiter = (await getCloudflareContext({ async: true })).env.WAITLIST_LIMITER;
    if (limiter) return !(await limiter.limit({ key: ip })).success;
  } catch {
    // not on Cloudflare
  }
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_HITS;
}

// New sign-ups only. Never throws: the sign-up is saved either way.
async function sendWelcome(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ msg: 'waitlist welcome not sent: RESEND_API_KEY is missing' }));
    return;
  }
  try {
    const mail = await welcomeMail(email, process.env.PAYLOAD_SECRET ?? '', SITE_URL);
    await sendBatch([mail], { apiKey, from: process.env.MAIL_FROM || 'Chipperly <no-reply@chipperlyapp.com>' });
  } catch (err) {
    console.error(JSON.stringify({ msg: 'waitlist welcome failed', err: String(err) }));
  }
}

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const checked = checkWaitlist(form);
  if ('error' in checked) return { status: 'error', message: checked.error };
  if (checked.bot) return { status: 'ok' }; // honeypot filled: look successful, store nothing

  const h = await headers();
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (await limited(ip)) return { status: 'error', message: 'Too many tries. Please wait a few minutes.' };

  try {
    const p = await payload();
    const existing = await p.count({ collection: 'waitlist', where: { email: { equals: checked.email } }, overrideAccess: true });
    // Already on the list: same answer as a new sign-up, so the form cannot
    // be used to test which emails are registered.
    if (!existing.totalDocs) {
      await p.create({ collection: 'waitlist', data: checked.data, overrideAccess: true });
      await sendWelcome(checked.email);
    }
    return { status: 'ok' };
  } catch (err) {
    (await payload()).logger.error({ err }, 'waitlist sign-up failed');
    return { status: 'error', message: 'Something went wrong on our side. Please try again, or email info@chipperlyapp.com.' };
  }
}
