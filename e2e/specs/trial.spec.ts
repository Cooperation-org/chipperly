import { test, expect } from '@playwright/test';
import { signUp, snap } from '../helpers';

// Settings > Account: the 21-day trial, and the early access code Chipperly gives everyone who signs up in the offer's dates.
test('a new account shows 21 days of trial and its own early access code', async ({ page }) => {
  test.skip(Date.now() > Date.UTC(2026, 9, 24, 23, 59, 59), 'EARLYCHIPPER ended on 24 Oct 2026');
  await signUp(page, { name: 'Trial Tester' });
  await expect(page.getByLabel('Early access code')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.waitForURL('**/settings/account/');
  await expect(page.getByText(/^21 days left/)).toBeVisible();
  await expect(page.getByText('Your early access code')).toBeVisible();
  await expect(page.getByText(/^EARLY-[A-Z0-9]{6}$/)).toBeVisible();
  await expect(page.getByText(/when your trial ends on/)).toBeVisible();
});

test('routine reminders: a custom number of days and a time, kept after a reload', async ({ page }) => {
  await signUp(page, { name: 'Reminder Tester' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.waitForURL('**/settings/profile/edit/**');

  const often = page.getByRole('radiogroup', { name: 'How often' });
  await expect(often.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');
  await often.getByRole('radio', { name: 'Custom' }).click();
  const days = page.getByRole('group', { name: 'Days between reminders' });
  await expect(days.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '7');
  await days.getByRole('button', { name: 'Increase' }).click();
  await expect(days.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '8');

  const times = page.getByRole('group', { name: 'Common times' });
  await times.getByRole('button').first().click();
  await expect(page.getByRole('group', { name: 'Reminder time' }).getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '8');

  await page.getByRole('group', { name: 'Common times' }).scrollIntoViewIfNeeded();
  await snap(page, 'reminder-picker');
  await page.reload();
  await expect(page.getByRole('group', { name: 'Days between reminders' }).getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '8');
  await expect(page.getByRole('group', { name: 'Reminder time' }).getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '8');
});
