import { test, expect } from '@playwright/test';
import { signUp } from '../helpers';

// Settings > Account: the 21-day trial and the conference's early access code.
test('a new account shows 21 days of trial and can add the early access code', async ({ page }) => {
  test.skip(Date.now() > Date.UTC(2026, 9, 24, 23, 59, 59), 'EARLYCHIPPER ended on 24 Oct 2026');
  await signUp(page, { name: 'Trial Tester' });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.waitForURL('**/settings/account/');
  await expect(page.getByText(/^21 days left/)).toBeVisible();

  await page.getByLabel('Early access code', { exact: true }).fill('nope');
  await page.getByRole('button', { name: 'Add code', exact: true }).click();
  await expect(page.getByText("That code isn't valid (or has ended).")).toBeVisible();

  await page.getByLabel('Early access code', { exact: true }).fill('earlychipper');
  await page.getByRole('button', { name: 'Add code', exact: true }).click();
  await expect(page.getByText(/^EARLYCHIPPER/)).toBeVisible();
});
