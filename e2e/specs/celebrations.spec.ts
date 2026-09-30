import { test, expect, type Page } from '@playwright/test';
import { signUp } from '../helpers';

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

// "Celebrate when a chip is earned" in Settings > "{name}'s view". On by default and covered in
// child.spec.ts; this is the off case.
test('no celebration when the option is off', async ({ page }) => {
  await signUp(page, { name: 'Quiet Tester' });
  await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings/');
  await page.getByRole('button', { name: /'s view$/ }).click();
  const sheet = page.getByRole('dialog', { name: /'s view$/ });
  await enterPin(page, '1234');
  await enterPin(page, '1234');

  const toggle = sheet.getByRole('switch', { name: 'Celebrate when a chip is earned' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^Lock to / }).click();
  await page.waitForURL('**/child/');

  await page.getByRole('checkbox', { name: /^Wake Up,/ }).click();
  await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /^1 of \d+ chips/ })).toBeVisible();
  await expect(page.getByTestId('celebration')).toHaveCount(0);
});
