// Signed unsubscribe links: the token is the address plus an HMAC of it, so
// the link works with no login and nobody can unsubscribe someone else. No
// expiry on purpose: an old email must still be able to opt out.
const enc = new TextEncoder();

const toB64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const key = (secret: string, usage: 'sign' | 'verify') => {
  if (!secret) throw new Error('PAYLOAD_SECRET is not set');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
};
const signed = (email: string) => enc.encode(`unsubscribe:${email}`);

export async function unsubscribeToken(email: string, secret: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const mac = await crypto.subtle.sign('HMAC', await key(secret, 'sign'), signed(e));
  return `${toB64u(enc.encode(e))}.${toB64u(new Uint8Array(mac))}`;
}

/** The address a token was made for, or null when it is malformed or was not signed with this secret. */
export async function readUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  try {
    const [a, b, extra] = token.split('.');
    if (!a || !b || extra !== undefined) return null;
    const email = new TextDecoder().decode(fromB64u(a));
    const ok = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), fromB64u(b), signed(email));
    return ok ? email : null;
  } catch {
    return null;
  }
}
