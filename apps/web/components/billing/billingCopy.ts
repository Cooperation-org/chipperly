import type { BillingStatus } from '@chipperly/shared/schemas/billing';

/** "12.50 per month" style text from what the server reports; never a number of our own. */
export function priceLabel(price: NonNullable<BillingStatus['price']>, locale?: string): string {
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency.toUpperCase() });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = fmt.format(price.amount / 10 ** digits);
  return price.interval ? `${amount} per ${price.interval}` : amount;
}

export function isLive(sub: BillingStatus['subscription']): boolean {
  return sub !== null && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due');
}

export function subscriptionLine(sub: NonNullable<BillingStatus['subscription']>): string {
  const end = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  if (sub.status === 'past_due') return 'Your last payment did not go through. Open the subscription to fix it.';
  if (!isLive(sub)) return 'Your subscription has ended.';
  if (sub.cancel_at_period_end) return end ? `Ends on ${end}.` : 'Ends at the close of this period.';
  return end ? `Renews on ${end}.` : 'Active.';
}
