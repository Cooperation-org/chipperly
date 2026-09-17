import type { AccountKind } from '../schemas/account.js';

/** Max profiles per account, by account kind. */
export const PROFILE_LIMITS: Record<AccountKind, number> = {
  individual: 1,
  household: 8,
  agency: Infinity,
};

/** Highest chip value/cost the picker UI offers. */
export const CHIP_MAX = 10;
export const COST_MAX = 20;
