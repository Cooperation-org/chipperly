// Who a newsletter goes to. The waitlist lives in this site's database; the
// app's users live in the API's, so they come through the adapter below.
export const AUDIENCES = [
  { label: 'Everyone (waitlist and app users)', value: 'all' },
  { label: 'Waitlist only', value: 'waitlist' },
  { label: 'Expired trials', value: 'trial_expired' },
  { label: 'Active subscribers', value: 'subscribed' },
] as const;
export type Audience = (typeof AUDIENCES)[number]['value'];

/**
 * The app sets the segment per account, by the same rule that pauses an account.
 * `trial_expired` = an admin (only admins can pay) whose account's trial and grace
 * days are over. `trial` = everyone else who is not subscribed: in a trial or its
 * grace days, or a member who cannot pay. Only "everyone" reaches them.
 */
export type Recipient = { email: string; segment: 'waitlist' | 'trial' | 'trial_expired' | 'subscribed' };

/** Lowercased, valid, de-duplicated addresses for the audience, minus anyone who unsubscribed. */
export function pickAudience(audience: Audience, recipients: Recipient[], unsubscribed: Set<string>): string[] {
  const out = new Set<string>();
  for (const r of recipients) {
    const email = r.email.trim().toLowerCase();
    if (audience !== 'all' && r.segment !== audience) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || unsubscribed.has(email)) continue;
    out.add(email);
  }
  return [...out];
}

export const NOT_CONNECTED = 'That segment is not connected yet. Set NEWSLETTER_API_SECRET on the site to match CRON_SECRET on the app.';

/**
 * Adapter for the app's users: GET <app>/api/internal/newsletter-audience
 * with the shared secret. Everything that talks to the app is in this one
 * function, so the app side can change without touching the rest.
 */
export async function fetchAppUsers(appUrl: string, secret: string | undefined, fetchImpl: typeof fetch = fetch): Promise<Recipient[]> {
  if (!secret) throw new Error(NOT_CONNECTED);
  const res = await fetchImpl(`${appUrl}/api/internal/newsletter-audience`, { headers: { 'x-cron-secret': secret } });
  if (!res.ok) throw new Error(`The app did not return its users (HTTP ${res.status}).`);
  return ((await res.json()) as { users: Recipient[] }).users;
}
