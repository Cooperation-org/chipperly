import { describe, expect, it } from 'vitest';
import { isLive, priceLabel, subscriptionLine } from './billingCopy';

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
});
