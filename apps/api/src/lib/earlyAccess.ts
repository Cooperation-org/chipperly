import { randomInt } from 'node:crypto';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { promo_codes, users } from '../db/schema/accounts.js';

// No 0/O, 1/I/L: read aloud or copied off a screen without mix-ups.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newPersonalCode(): string {
  let code = 'EARLY-';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Gives this person their own code under an offer. Retries on the (unlikely) clash with someone else's code. */
export async function issuePersonalCode(userId: string, offer: string, at = Date.now()): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const code = newPersonalCode();
    try {
      await db.update(users).set({ personal_code: code, promo_code: offer, promo_code_at: at }).where(eq(users.id, userId));
      return code;
    } catch (err) {
      if (attempt >= 4) throw err;
    }
  }
}

/** Anyone who signed up inside an active auto-issue offer's dates and has no code yet gets one. Called from GET /me, so every sign-up path is covered. */
export async function issueIfEligible(user: { id: string; created_at: number; personal_code: string | null }): Promise<void> {
  if (user.personal_code) return;
  const [offer] = await db
    .select({ code: promo_codes.code })
    .from(promo_codes)
    .where(
      and(
        eq(promo_codes.auto_issue, true),
        eq(promo_codes.active, true),
        lte(promo_codes.valid_from, user.created_at),
        gte(promo_codes.valid_until, user.created_at),
      ),
    )
    .limit(1);
  if (!offer) return;
  // Only if still unset: two /me calls at once must not issue twice.
  const [still] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, user.id), isNull(users.personal_code))).limit(1);
  if (still) await issuePersonalCode(user.id, offer.code);
}
