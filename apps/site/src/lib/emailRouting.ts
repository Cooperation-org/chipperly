// Cloudflare Email Routing for @chipperlyapp.com, driven by the "Email
// addresses" collection in /admin. Forwarding only: mail to an address is
// passed on to someone's existing inbox. Each destination must confirm a
// verification email from Cloudflare once before mail is delivered to it.
//
// Needs (Worker secret / vars): CLOUDFLARE_EMAIL_API_TOKEN with Zone >
// Email Routing Rules > Edit and Account > Email Routing Addresses > Edit,
// plus EMAIL_ROUTING_ACCOUNT_ID, EMAIL_ROUTING_ZONE_ID and EMAIL_DOMAIN.

export const CATCH_ALL = '*';
const API = 'https://api.cloudflare.com/client/v4';

export type Forward = { localPart: string; destination: string; enabled: boolean };

export function emailConfig() {
  const token = process.env.CLOUDFLARE_EMAIL_API_TOKEN;
  const accountId = process.env.EMAIL_ROUTING_ACCOUNT_ID;
  const zoneId = process.env.EMAIL_ROUTING_ZONE_ID;
  const domain = process.env.EMAIL_DOMAIN || 'chipperlyapp.com';
  return token && accountId && zoneId ? { token, accountId, zoneId, domain } : null;
}

/** "info", "first.last", "team-2" or "*" (catch-all). */
export function validLocalPart(value: unknown) {
  return typeof value === 'string' && (value === CATCH_ALL || /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(value));
}

/** Body for a literal-address rule, or for the catch-all rule. */
export function ruleBody(f: Forward, domain: string) {
  const actions = [{ type: 'forward', value: [f.destination.trim().toLowerCase()] }];
  if (f.localPart === CATCH_ALL) {
    return { name: 'Catch-all (managed in /admin)', enabled: f.enabled, matchers: [{ type: 'all' }], actions };
  }
  return {
    name: `${f.localPart}@${domain} (managed in /admin)`,
    enabled: f.enabled,
    matchers: [{ type: 'literal', field: 'to', value: `${f.localPart}@${domain}` }],
    actions,
  };
}

type CfResponse<T> = { success: boolean; result: T; errors?: { code: number; message: string }[] };

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<CfResponse<T>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return (await res.json()) as CfResponse<T>;
}

const fail = (what: string, r: CfResponse<unknown>) =>
  new Error(`Cloudflare ${what} failed: ${(r.errors ?? []).map((e) => e.message).join('; ') || 'unknown error'}`);

type Destination = { email: string; verified: string | null };

/** Adds the destination if new (Cloudflare then emails it a verification link) and reports whether it is verified. */
export async function ensureDestination(email: string): Promise<'verified' | 'pending'> {
  const c = emailConfig();
  if (!c) throw new Error('Email routing is not configured.');
  const addr = email.trim().toLowerCase();
  const list = await cf<Destination[]>(c.token, `/accounts/${c.accountId}/email/routing/addresses?per_page=50`);
  if (!list.success) throw fail('listing destination addresses', list);
  let found = list.result.find((d) => d.email.toLowerCase() === addr);
  if (!found) {
    const made = await cf<Destination>(c.token, `/accounts/${c.accountId}/email/routing/addresses`, {
      method: 'POST',
      body: JSON.stringify({ email: addr }),
    });
    if (!made.success) throw fail('adding the destination address', made);
    found = made.result;
  }
  return found.verified ? 'verified' : 'pending';
}

/** Creates or updates the rule and returns its id ("catch_all" for the catch-all). */
export async function upsertRule(f: Forward, ruleId?: string | null): Promise<string> {
  const c = emailConfig();
  if (!c) throw new Error('Email routing is not configured.');
  const body = JSON.stringify(ruleBody(f, c.domain));
  const base = `/zones/${c.zoneId}/email/routing/rules`;
  if (f.localPart === CATCH_ALL) {
    const r = await cf<unknown>(c.token, `${base}/catch_all`, { method: 'PUT', body });
    if (!r.success) throw fail('saving the catch-all rule', r);
    return 'catch_all';
  }
  if (ruleId && ruleId !== 'catch_all') {
    const r = await cf<{ id: string }>(c.token, `${base}/${ruleId}`, { method: 'PUT', body });
    if (r.success) return r.result.id;
    // The rule was removed in the Cloudflare dashboard: create it again below.
  }
  const r = await cf<{ id: string }>(c.token, base, { method: 'POST', body });
  if (!r.success) throw fail('creating the forwarding rule', r);
  return r.result.id;
}

/** Removes the rule; the catch-all is switched back to "drop". */
export async function deleteRule(localPart: string, ruleId?: string | null) {
  const c = emailConfig();
  if (!c) return;
  const base = `/zones/${c.zoneId}/email/routing/rules`;
  if (localPart === CATCH_ALL) {
    await cf(c.token, `${base}/catch_all`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Catch-all', enabled: false, matchers: [{ type: 'all' }], actions: [{ type: 'drop' }] }),
    });
    return;
  }
  if (ruleId) await cf(c.token, `${base}/${ruleId}`, { method: 'DELETE' });
}
