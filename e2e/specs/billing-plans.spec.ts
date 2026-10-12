import { test, expect } from '@playwright/test';
import { signUp } from '../helpers';

// The harness has no Stripe keys (GET /billing 404s), so the billing status is stubbed in the browser.
// Nothing here calls Stripe: the test only reads the plan picker and never taps a subscribe button.
const price = (plan: 'default' | 'yearly', amount: number) => ({
  plan,
  amount,
  currency: 'usd',
  interval: plan === 'yearly' ? 'year' : 'month',
});
const DAY = 86_400_000;

// The app's service worker would fetch /api/billing itself, out of page.route's reach.
test.use({ serviceWorkers: 'block' });

test('the subscription screen lets you pick yourself or your family, monthly or yearly', async ({ page }) => {
  await page.route('**/api/billing', (route) =>
    route.fulfill({
      json: {
        kind: 'household',
        checkout_available: true,
        price: price('default', 1500),
        prices: [price('default', 1500), price('yearly', 15000)],
        kinds: [
          { kind: 'individual', prices: [price('default', 900), price('yearly', 9000)] },
          { kind: 'household', prices: [price('default', 1500), price('yearly', 15000)] },
        ],
        subscription: null,
        can_manage: true,
        access: { state: 'trial', ended_at: Date.now() + 21 * DAY, pauses_at: Date.now() + 28 * DAY, write_paused: false },
        discount: null,
      },
    }),
  );
  await signUp(page, { name: 'Plan Tester' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.waitForURL('**/settings/billing/');

  const card = page.getByRole('region', { name: 'Subscription' });
  const picker = card.getByRole('radiogroup', { name: 'Plan' });
  // The account's own kind (a family) is picked to start with.
  await expect(picker.getByRole('radio', { name: 'My family' })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('button', { name: /^Monthly: \$15\.00 per month$/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /^Yearly: \$150\.00 per year, saves \$30\.00$/ })).toBeVisible();

  await picker.getByRole('radio', { name: 'Myself' }).click();
  await expect(picker.getByRole('radio', { name: 'Myself' })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('button', { name: /^Monthly: \$9\.00 per month$/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /^Yearly: \$90\.00 per year, saves \$18\.00$/ })).toBeVisible();
});
