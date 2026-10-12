import type { AccountKind } from '../schemas/account.js';

/** Max profiles per account, by account kind. */
export const PROFILE_LIMITS: Record<AccountKind, number> = {
  individual: 1,
  household: 6,
  agency: Infinity,
  /** One person, managed by someone else. */
  supported: 1,
};

/** A household has at most this many admins; an admin who is also a Primary User still takes one profile slot. */
export const HOUSEHOLD_ADMIN_LIMIT = 2;

/** Highest chip value/cost the picker UI offers. */
export const CHIP_MAX = 10;
export const COST_MAX = 20;
