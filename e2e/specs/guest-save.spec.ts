import { test, expect } from '@playwright/test';
import { gotoCaregiver, reloadCaregiver, toast } from '../helpers';

// "Save my work": a guest who signs up keeps what they built (lib/auth/carryOver.ts). Their rows are
// re-keyed onto a new profile and queued for sync, so a second device signing in sees them too.

const BETA_INVITE_CODE = 'e2e-beta-code';

test('a guest who creates an account keeps their routine check and event, locally and on the server', async ({ page, browser }) => {
  const password = 'correct-horse-battery-staple';
  const email = `e2e-guest-save-${Date.now()}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Try it without an account', exact: true }).click();
  await page.waitForURL('**/today/');

  const routine = page.getByRole('checkbox', { name: /^Morning Routine,/ });
  await expect(routine).toHaveAttribute('aria-checked', 'false');
  await routine.click();
  await expect(routine).toHaveAttribute('aria-checked', 'true');

  const section = page.getByRole('region', { name: 'Coming up' });
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: 'Add an event', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('What is happening', { exact: true }).fill('Horse lesson');
  const day = new Date();
  day.setDate(day.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, '0');
  await sheet.getByLabel('Day', { exact: true }).fill(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(section.getByText('Horse lesson')).toBeVisible();

  // The banner keeps the work instead of erasing it, and says so on the sign-up page.
  await page.getByRole('button', { name: 'Save my work', exact: true }).click();
  await page.waitForURL('**/sign-up/');
  await expect(page.getByText(/Your trial work is saved when you create a new account here/)).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Guest Saver');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  // No onboarding: the profile was made from the guest's, and Today has what they built.
  await page.waitForURL('**/today/');
  await expect(toast(page)).toContainText('Your work is saved to your account.');
  await expect(page.getByRole('checkbox', { name: /^Morning Routine,/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('Horse lesson')).toBeVisible();

  // A full reload keeps it (the rows are the signed-in profile's now, not the guest's).
  await reloadCaregiver(page, password);
  await expect(page.getByRole('checkbox', { name: /^Morning Routine,/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('region', { name: 'Coming up' }).getByText('Horse lesson')).toBeVisible();

  // The server has it: a fresh browser context signs in and pulls it.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  try {
    await page2.goto('/');
    await page2.getByLabel('Email', { exact: true }).fill(email);
    await page2.getByLabel('Password', { exact: true }).fill(password);
    await page2.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page2.waitForURL((url) => !['/', '/sign-up/'].includes(url.pathname));
    await gotoCaregiver(page2, '/today/', password);
    await expect(page2.getByRole('checkbox', { name: /^Morning Routine,/ })).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await expect(page2.getByRole('region', { name: 'Coming up' }).getByText('Horse lesson')).toBeVisible({ timeout: 30_000 });
    // And nothing was seeded twice: exactly one Morning Routine.
    await expect(page2.getByRole('checkbox', { name: /^Morning Routine,/ })).toHaveCount(1);
  } finally {
    await other.close();
  }
});
