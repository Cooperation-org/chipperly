/**
 * PIN hash string format shared by the server (Node `crypto.pbkdf2`) and
 * the client (WebCrypto): `pbkdf2$<iterations>$<salt b64url>$<hash b64url>`.
 * No crypto lives here, only the string shape.
 */

export interface ParsedPinHash {
  readonly iterations: number;
  readonly salt: string;
  readonly hash: string;
}

export function formatPinHash(salt: string, hash: string, iterations: number): string {
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export function parsePinHash(str: string): ParsedPinHash {
  const parts = str.split('$');
  const [scheme, iterationsStr, salt, hash] = parts;
  if (parts.length !== 4 || scheme !== 'pbkdf2' || !salt || !hash) {
    throw new Error('invalid pin hash format');
  }
  const iterations = Number(iterationsStr);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error('invalid pin hash format');
  }
  return { iterations, salt, hash };
}
