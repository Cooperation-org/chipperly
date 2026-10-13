/**
 * Organization plans, paid yearly, priced by how many Primary Users the
 * organization serves (business plan, decided 12 Oct 2026). Families and
 * support team members under an organization are free. `custom` is for more
 * than 1,000: the admin types the seats and the yearly price.
 * Stored on accounts.org_tier / accounts.seat_limit.
 */
export const ORG_TIERS = {
  '25': { seats: 25, yearly_cents: 150_000, label: 'Pilot, up to 25' },
  '100': { seats: 100, yearly_cents: 600_000, label: 'Up to 100' },
  '250': { seats: 250, yearly_cents: 1_250_000, label: 'Up to 250' },
  '500': { seats: 500, yearly_cents: 2_000_000, label: 'Up to 500' },
  '1000': { seats: 1000, yearly_cents: 3_500_000, label: 'Up to 1,000' },
} as const;

export type FixedOrgTier = keyof typeof ORG_TIERS;
export const ORG_TIER_KEYS = ['25', '100', '250', '500', '1000', 'custom'] as const;
export type OrgTier = (typeof ORG_TIER_KEYS)[number];
