import type { BillingStatus } from '@chipperly/shared/schemas/billing';
import { describe, expect, it } from 'vitest';
import { accessNotice, discountLine, isLive, planChoices, planLine, priceLabel, subscriptionLine } from './billingCopy';

describe('billingCopy', () => {
  it('formats whatever price the server reports', () => {
    expect(priceLabel({ amount: 1250, currency: 'usd', interval: 'month' }, 'en-US')).toBe('$12.50 per month');
    expect(priceLabel({ amount: 500, currency: 'jpy', interval: null }, 'en-US')).toContain('500');
  });

  it('knows which statuses count as a live subscription', () => {
    expect(isLive(null)).toBe(false);
    expect(isLive({ status: 'canceled', current_period_end: null, cancel_at_period_end: false })).toBe(false);
    expect(isLive({ status: 'past_due', current_period_end: null, cancel_at_period_end: false })).toBe(true);
  });

  it('says what happens next', () => {
    expect(subscriptionLine({ status: 'active', current_period_end: null, cancel_at_period_end: true })).toMatch(/^Ends/);
    expect(subscriptionLine({ status: 'canceled', current_period_end: null, cancel_at_period_end: false })).toMatch(/ended/);
  });

  const at = { ended_at: Date.UTC(2026, 9, 1), pauses_at: Date.UTC(2026, 9, 8) };

  it('says nothing unless the trial has ended', () => {
    for (const state of ['open', 'subscribed', 'trial'] as const) {
      expect(accessNotice({ state, ...at, write_paused: false }, true)).toBeNull();
    }
  });

  it('grace is a heads-up that promises everything still works', () => {
    const n = accessNotice({ state: 'grace', ...at, write_paused: false }, true, 'en-US', 'UTC');
    expect(n?.tone).toBe('heads_up');
    expect(n?.body).toContain('Everything still works');
    expect(n?.body).toContain('October 8, 2026');
  });

  it('lapsed names what still works and what to do, without blame', () => {
    const admin = accessNotice({ state: 'lapsed', ...at, write_paused: true }, true, 'en-US', 'UTC');
    expect(admin?.tone).toBe('paused');
    expect(admin?.body).toMatch(/still here/);
    expect(admin?.body).toMatch(/export/);
    expect(admin?.body).toMatch(/Subscribe/);
    expect(accessNotice({ state: 'lapsed', ...at, write_paused: true }, true, 'en-US', 'UTC', true)?.body).toMatch(/Write to support@chipperlyapp\.com/);
    const member = accessNotice({ state: 'lapsed', ...at, write_paused: true }, false, 'en-US', 'UTC');
    expect(member?.body).toMatch(/Ask an account admin/);
    expect(`${admin?.title}${admin?.body}${member?.body}`).not.toMatch(/—|locked out|deleted|lost/i);
  });

  it('describes the discount and when it does not apply', () => {
    expect(discountLine({ code: 'EARLY-ABC234', percent_off: 25, applies_to: 'annual', applicable: true })).toContain('applied at checkout');
    expect(discountLine({ code: 'EARLY-ABC234', percent_off: 25, applies_to: 'annual', applicable: false })).toContain('not annual');
    expect(discountLine({ code: 'X', percent_off: 10, applies_to: 'any', applicable: true })).toContain('any plan');
  });

  it('plan line follows the access state', () => {
    const base: Omit<BillingStatus, 'access'> = { kind: 'household', checkout_available: true, price: null, prices: [], subscription: null, can_manage: true, discount: null };
    expect(planLine({ ...base, access: { state: 'trial', ...at, write_paused: false } }, 'en-US', 'UTC')).toBe('Free trial. Ends on October 1, 2026.');
    expect(planLine({ ...base, access: { state: 'lapsed', ...at, write_paused: true } })).toBe('No active subscription.');
    expect(planLine({ ...base, access: { state: 'subscribed', ended_at: Date.UTC(2027, 9, 1), pauses_at: null, write_paused: false } }, 'en-US', 'UTC')).toBe('You have free access until October 1, 2027.');
  });
});

describe('planChoices', () => {
  const month = { plan: 'default', amount: 1000, currency: 'usd', interval: 'month' } as const;
  const year = { plan: 'yearly', amount: 10000, currency: 'usd', interval: 'year' } as const;

  it('is a plain Subscribe for one price or none', () => {
    expect(planChoices([])).toEqual([{ plan: 'default', label: 'Subscribe' }]);
    expect(planChoices([month])).toEqual([{ plan: 'default', label: 'Subscribe' }]);
  });

  it('names both plans and says what the yearly one saves', () => {
    expect(planChoices([month, year], 'en-US')).toEqual([
      { plan: 'default', label: 'Monthly: $10.00 per month' },
      { plan: 'yearly', label: 'Yearly: $100.00 per year, saves $20.00' },
    ]);
  });

  it('does not claim a saving when the yearly price is not cheaper', () => {
    expect(planChoices([month, { ...year, amount: 12000 }], 'en-US')[1]?.label).toBe('Yearly: $120.00 per year');
  });
});
