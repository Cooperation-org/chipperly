// The panel's own sign-in, until Cloudflare Access is switched on for it: email, password and, unless
// twoStep is off (OPS_TWO_STEP=off), a 6-digit authenticator code (TOTP, RFC 6238). People are added
// with `node adduser.mjs` on the server.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map((c) => B32[parseInt(c.padEnd(5, '0'), 2)]).join('');
}

function unbase32(s) {
  const bits = [...s.replace(/[\s=]/g, '').toUpperCase()].map((c) => B32.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

/** The code for one 30-second step. */
export function totp(secret, step, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

/** The step a code matches (this one, or one either side for clock drift), or null. */
export function matchTotp(secret, code, now = Date.now()) {
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) if (totp(secret, s) === String(code).trim()) return s;
  return null;
}

export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 32).toString('base64')}`;
}

export function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length);
  return timingSafeEqual(got, want);
}

/** Sign-in with lockout and one-time codes. `file` is a JSON list of {email, password, totp}. */
export function createAuth(file, { now = () => Date.now(), sessionHours = 12, twoStep = true } = {}) {
  const sessions = new Map(); // token -> { email, exp }
  const fails = new Map(); // email or ip -> [times]
  const usedStep = new Map(); // email -> last TOTP step used, so a code works once
  const load = () => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  };
  const locked = (key) => (fails.get(key) || []).filter((t) => t > now() - 15 * 60_000).length >= 5;
  const fail = (key) => fails.set(key, [...(fails.get(key) || []).filter((t) => t > now() - 15 * 60_000), now()]);

  return {
    /** Returns { token, email } or { error }. Every failure looks the same from outside. */
    signIn({ email, password, code }, ip) {
      const who = String(email || '').trim().toLowerCase();
      if (locked(who) || locked(ip)) return { error: 'Too many tries. Wait 15 minutes.' };
      const user = load().find((u) => u.email.toLowerCase() === who);
      const passwordOk = Boolean(user) && checkPassword(password, user.password);
      const step = passwordOk && twoStep ? matchTotp(user.totp, code, now()) : null;
      if (!passwordOk || (twoStep && (step == null || step <= (usedStep.get(who) ?? -1)))) {
        fail(who);
        fail(ip);
        return { error: twoStep ? 'Email, password or code is wrong.' : 'Email or password is wrong.' };
      }
      if (twoStep) usedStep.set(who, step);
      fails.delete(who);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { email: user.email, exp: now() + sessionHours * 3600_000 });
      return { token, email: user.email };
    },
    user(token) {
      const s = token && sessions.get(token);
      if (!s) return null;
      if (s.exp < now()) {
        sessions.delete(token);
        return null;
      }
      return s.email;
    },
    signOut(token) {
      sessions.delete(token);
    },
    /** For adduser.mjs. */
    save(users) {
      writeFileSync(file, JSON.stringify(users, null, 2), { mode: 0o600 });
    },
    load,
  };
}
