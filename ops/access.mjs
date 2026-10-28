// Checks a Cloudflare Access token (the Cf-Access-Jwt-Assertion header): RS256, signed by one of
// the team's keys, for our application (aud), from our team (iss), not expired. Returns the email.
import { verify } from 'node:crypto';

const part = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());

/** keys: { [kid]: KeyObject }. Returns the email, or null for anything not exactly right. */
export function verifyAccessJwt(token, keys, { team, aud, now = Date.now() }) {
  if (typeof token !== 'string' || !team || !aud) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = part(h);
    const claims = part(p);
    const key = keys[header.kid];
    if (!key || header.alg !== 'RS256') return null;
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return null;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(aud) || claims.iss !== `https://${team}` || !(claims.exp * 1000 > now)) return null;
    return claims.email || claims.sub || null;
  } catch {
    return null;
  }
}
