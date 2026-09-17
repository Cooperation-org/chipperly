import { randomBytes, scrypt as scryptCb, timingSafeEqual, pbkdf2 as pbkdf2Cb } from 'node:crypto';
import { promisify } from 'node:util';
import { formatPinHash, parsePinHash } from '@chipperly/shared/helpers/pin';

const pbkdf2 = promisify(pbkdf2Cb);

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const PIN_ITERATIONS = 100_000;
const PIN_KEYLEN = 32;

// `util.promisify(scrypt)` only types the (password, salt, keylen, cb)
// overload, not the one with `options`; wrap both by hand instead.
function scrypt(password: string, salt: Buffer, keylen: number, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: n }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Account password hashing: `scrypt$N$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_N);
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const [, nStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  if (!Number.isFinite(n) || n <= 0) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, expected.length, n);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** PIN hashing: exact format from CONTRACTS.md "PIN" — shared with the client's WebCrypto implementation. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await pbkdf2(pin, salt, PIN_ITERATIONS, PIN_KEYLEN, 'sha256')) as Buffer;
  return formatPinHash(salt, derived.toString('base64url'), PIN_ITERATIONS);
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const { iterations, salt, hash } = parsePinHash(stored);
  const expected = Buffer.from(hash, 'base64url');
  const derived = (await pbkdf2(pin, salt, iterations, expected.length, 'sha256')) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
