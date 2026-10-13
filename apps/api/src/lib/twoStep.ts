import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

// Two-step sign-in for the admin site: standard authenticator codes (RFC 6238:
// HMAC-SHA1, 30-second steps, 6 digits), the same that Google Authenticator,
// 1Password and Authy show. No library: it is a few lines of node:crypto.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The 6-digit code for one 30-second step. */
export function totp(secret: Buffer, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / STEP_MS)));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** True when the code matches now or one step either side (phone clocks drift). */
export function checkTotp(secret: Buffer, code: string, nowMs = Date.now()): boolean {
  const given = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(totp(secret, nowMs + d * STEP_MS)), Buffer.from(given)));
}

export function newSecret(): Buffer {
  return randomBytes(20);
}

export function otpauthUrl(secret: Buffer, email: string): string {
  const label = encodeURIComponent(`Chipperly admin:${email}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent('Chipperly admin')}&algorithm=SHA1&digits=6&period=30`;
}

// ---- the secret at rest: AES-256-GCM with a key derived from JWT_SECRET ----

const key = () => createHash('sha256').update(`chipperly-admin-two-step:${env.JWT_SECRET}`).digest();

export function sealSecret(secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function openSecret(sealed: string): Buffer {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !body) throw new Error('bad sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

// ---- recovery codes: shown once, stored as hashes, each works once ----

export const hashRecovery = (code: string) => createHash('sha256').update(code.toUpperCase().replace(/[\s-]/g, '')).digest('hex');

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

// ---- the pass: proof a code was accepted, sent as X-Admin-Step ----

export const PASS_MS = 12 * 60 * 60 * 1000;
const passMac = (userId: string, exp: number) => createHmac('sha256', `chipperly-admin-pass:${env.JWT_SECRET}`).update(`${userId}.${exp}`).digest('base64url');

export function issuePass(userId: string, nowMs = Date.now()): { token: string; expires_at: number } {
  const exp = nowMs + PASS_MS;
  return { token: `${exp}.${passMac(userId, exp)}`, expires_at: exp };
}

export function checkPass(userId: string, token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  const [expText, mac] = token.split('.');
  const exp = Number(expText);
  if (!mac || !Number.isFinite(exp) || exp < nowMs) return false;
  const want = Buffer.from(passMac(userId, exp));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
