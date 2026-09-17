import { formatPinHash, parsePinHash } from '@chipperly/shared/helpers/pin';

// CONTRACTS.md "PIN": pbkdf2$<iterations>$<salt b64url>$<hash b64url>,
// PBKDF2-SHA256, 32-byte output, verifiable identically on server (Node
// crypto.pbkdf2) and here (WebCrypto).
const ITERATIONS = 100_000;
const HASH_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(pin, salt, ITERATIONS);
  return formatPinHash(toBase64Url(salt), toBase64Url(hash), ITERATIONS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const parsed = parsePinHash(hash);
  const salt = fromBase64Url(parsed.salt);
  const computed = await deriveBits(pin, salt, parsed.iterations);
  return timingSafeEqual(toBase64Url(computed), parsed.hash);
}
