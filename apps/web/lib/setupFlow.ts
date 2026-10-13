import type { Role } from '@chipperly/shared/schemas/account';

/** A household holds at most this many people (PROFILE_LIMITS.household), the admin included when they use Chipperly too. */
export const FAMILY_MAX = 6;
/** The server's password rule (passwordSchema in schemas/auth.ts). */
export const TEMP_PASSWORD_MIN = 8;

export interface PersonDraft {
  id: string;
  name: string;
  emoji: string | null;
  photo_id: string | null;
}

/** The sign-up name for a "What should we call you?" field. Never an email: some sign-ups use the address as the name. */
export function prefillName(displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim();
  return name.includes('@') ? '' : name;
}

/** "3 of 6", so the limit is never a surprise. */
export function familyCounter(count: number): string {
  return `${count} of ${FAMILY_MAX}`;
}

/** Another row fits while the rows plus the "I will use Chipperly too" person are under the limit. */
export function canAddRow(rows: number, meOn: boolean): boolean {
  return rows + (meOn ? 1 : 0) < FAMILY_MAX;
}

/** The admin can join only while a seat is free: turning it on never drops a named person. */
export function canAddMe(rows: number): boolean {
  return canAddRow(rows, false);
}

/** The own-login request is sent only when the supported person uses Chipperly themselves. */
export function sendsOwnLogin(usesApp: boolean, loginOn: boolean): boolean {
  return usesApp && loginOn;
}

/** The people to create: named rows in order, then the admin when they use Chipperly too. Blank rows are dropped. */
export function familyPeople(rows: readonly PersonDraft[], me: PersonDraft | null): PersonDraft[] {
  const named = [...rows, ...(me ? [me] : [])].map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name !== '');
  return named.slice(0, FAMILY_MAX);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function looksLikeEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** Error text for a temporary password, or undefined when it is fine. */
export function tempPasswordError(password: string): string | undefined {
  return password.length < TEMP_PASSWORD_MIN ? `Use at least ${TEMP_PASSWORD_MIN} characters.` : undefined;
}

/** A support team invite collected during setup, sent once the person exists. */
export interface HelperInvite {
  email: string;
  role: Role;
}

/** Adds an invite unless that address is already on the list (any role); returns the list unchanged for a bad or repeated address. */
export function addHelper(list: readonly HelperInvite[], email: string, role: Role): HelperInvite[] {
  const clean = email.trim().toLowerCase();
  if (!looksLikeEmail(clean) || list.some((h) => h.email === clean)) return [...list];
  return [...list, { email: clean, role }];
}
