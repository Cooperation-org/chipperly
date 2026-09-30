import { expect, test } from '@playwright/test';

// A beta tester on a weak phone connection tapped "Go to Today" and nothing happened: the flow
// awaited an API call that never came back. Navigation must not depend on the network.
test('Go to Today still lands on Today when every API request stalls', async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill('Slow Sam');
  await page.getByLabel('Email', { exact: true }).fill(`e2e-slow-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill('e2e-beta-code');
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  await page.waitForURL('**/onboarding/kind/');
  await page.getByRole('button', { name: /My family/ }).click();
  await page.waitForURL('**/onboarding/profile/');
  await page.getByLabel('Name', { exact: true }).fill('Benny');
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Choose a picture' }).getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click();
  await page.waitForURL('**/onboarding/ready/');

  // From here on the network is effectively dead: every API call waits a minute.
  await page.route('**/api/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    await route.continue().catch(() => undefined);
  });

  await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
  await page.waitForURL('**/today/', { timeout: 10_000 });
});
