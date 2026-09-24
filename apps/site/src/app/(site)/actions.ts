'use server';

import { headers } from 'next/headers';
import { payload } from '../../lib/payload';
import { checkWaitlist, type WaitlistState } from '../../lib/waitlist';

// ponytail: in-memory per-IP limit, per process. Move to Postgres or the
// proxy if the site ever runs on more than one instance.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_HITS;
}

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const checked = checkWaitlist(form);
  if ('error' in checked) return { status: 'error', message: checked.error };
  if (checked.bot) return { status: 'ok' }; // honeypot filled: look successful, store nothing

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (limited(ip)) return { status: 'error', message: 'Too many tries. Please wait a few minutes.' };

  try {
    const p = await payload();
    const existing = await p.count({ collection: 'waitlist', where: { email: { equals: checked.email } }, overrideAccess: true });
    // Already on the list: same answer as a new sign-up, so the form cannot
    // be used to test which emails are registered.
    if (!existing.totalDocs) {
      await p.create({ collection: 'waitlist', data: checked.data, overrideAccess: true });
    }
    return { status: 'ok' };
  } catch (err) {
    (await payload()).logger.error({ err }, 'waitlist sign-up failed');
    return { status: 'error', message: 'Something went wrong on our side. Please try again, or email info@chipperlyapp.com.' };
  }
}
