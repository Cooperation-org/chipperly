import type { Access, BillingDiscount, BillingPlan, BillingStatus } from '@chipperly/shared/schemas/billing';

/** "12.50 per month" style text from what the server reports; never a number of our own. */
export function priceLabel(price: NonNullable<BillingStatus['price']>, locale?: string): string {
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency.toUpperCase() });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = fmt.format(price.amount / 10 ** digits);
  return price.interval ? `${amount} per ${price.interval}` : amount;
}

export interface PlanChoice {
  plan: BillingPlan;
  label: string;
}

/**
 * The buttons for the plans that can be bought. One price: a plain "Subscribe". Two: each says what it
 * costs, and the yearly one says what it saves against twelve months at the monthly price.
 */
export function planChoices(prices: BillingStatus['prices'], locale?: string): PlanChoice[] {
  if (prices.length < 2) return [{ plan: 'default', label: 'Subscribe' }];
  const monthly = prices.find((p) => p.interval === 'month');
  return prices.map((p) => {
    const name = p.interval === 'year' ? 'Yearly' : p.interval === 'month' ? 'Monthly' : 'Subscribe';
    let label = `${name}: ${priceLabel(p, locale)}`;
    const saves = monthly && p.interval === 'year' && monthly.currency === p.currency ? monthly.amount * 12 - p.amount : 0;
    if (saves > 0) label += `, saves ${priceLabel({ amount: saves, currency: p.currency, interval: null }, locale)}`;
    return { plan: p.plan, label };
  });
}

export function formatDate(ms: number, locale?: string, timeZone?: string): string {
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

export interface AccessNotice {
  /** `paused` = new things are paused; `heads_up` = nothing has changed yet. */
  tone: 'paused' | 'heads_up';
  title: string;
  body: string;
}

/**
 * What to tell a caregiver about their access. Null when there is nothing to say
 * (billing off, subscribed, or a trial with time left). Never blames, never says
 * data is at risk, and always says what to do next.
 */
export function accessNotice(access: Access, canManage: boolean, locale?: string, timeZone?: string): AccessNotice | null {
  if (access.state !== 'grace' && access.state !== 'lapsed') return null;
  const ended = access.ended_at === null ? 'recently' : `on ${formatDate(access.ended_at, locale, timeZone)}`;
  const next = canManage ? 'Subscribe to add new things again.' : 'Ask an account admin to subscribe to add new things again.';
  if (access.state === 'grace') {
    const until = access.pauses_at === null ? 'soon' : formatDate(access.pauses_at, locale, timeZone);
    return {
      tone: 'heads_up',
      title: 'Your free trial has ended',
      body: `It ended ${ended}. Everything still works. From ${until}, adding new things pauses until there is a subscription. ${canManage ? 'You can subscribe from Settings.' : 'Ask an account admin to subscribe.'}`,
    };
  }
  return {
    tone: 'paused',
    title: 'Adding new things is paused',
    body: `The free trial ended ${ended}. All your routines, rewards and history are still here, the child view works as usual, and you can export everything at any time. ${next}`,
  };
}

/** "25% off the annual plan" (and why it may not apply), from what the server reports. */
export function discountLine(discount: BillingDiscount): string {
  const plan = discount.applies_to === 'annual' ? 'the annual plan' : 'any plan';
  const base = `${discount.percent_off}% off ${plan} (code ${discount.code})`;
  return discount.applicable ? `${base}. It is applied at checkout.` : `${base}. Your plan is not annual, so it does not apply to it.`;
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

/** The one-line "current plan" answer for the top of the billing card. */
export function planLine(status: BillingStatus, locale?: string, timeZone?: string): string {
  const { access, subscription } = status;
  if (subscription && access.state === 'subscribed') return subscriptionLine(subscription);
  // Subscribed with no subscription: free access given by Chipperly's team (accounts.comp_until).
  if (access.state === 'subscribed') return access.ended_at === null ? 'You have free access.' : `You have free access until ${formatDate(access.ended_at, locale, timeZone)}.`;
  if (access.state === 'trial' && access.ended_at !== null) return `Free trial. Ends on ${formatDate(access.ended_at, locale, timeZone)}.`;
  if (access.state === 'grace' || access.state === 'lapsed') return 'No active subscription.';
  return subscription ? subscriptionLine(subscription) : 'You are on the free trial.';
}
