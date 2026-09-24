import { test, expect } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

// The super admin dashboard (e2e/server.mjs lists admin-<project>@example.com in SUPER_ADMIN_EMAILS).
test('a super admin sees the dashboard, sets the early access discount, and extends a trial', async ({ page }, testInfo) => {
  await signUp(page, { name: 'Boss', email: `admin-${testInfo.project.name}@example.com` });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Admin dashboard/ }).click();
  await page.waitForURL('**/settings/admin/');
  await expect(page.getByText('People', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sign-ups, last 30 days' })).toBeVisible();

  const codes = page.getByRole('region', { name: 'Early access codes' });
  await codes.getByRole('button', { name: /^EARLYCHIPPER/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Discount (%)').fill('30');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(codes.getByRole('button', { name: /^EARLYCHIPPER/ })).toContainText('30% off annual');

  const people = page.getByRole('region', { name: 'People' });
  await people.getByLabel('Search name or email').fill(`admin-${testInfo.project.name}`);
  await expect(people.getByText(/^Trial: 21 days left/)).toBeVisible();
  await people.getByRole('button', { name: '+7 days', exact: true }).click();
  await expect(people.getByText(/^Trial: 28 days left/)).toBeVisible();
  await expectNoOverflow(page, 'admin dashboard');
});

test('everyone else gets no admin row and no dashboard', async ({ page }) => {
  await signUp(page, { name: 'Not Boss' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Admin dashboard/ })).toHaveCount(0);
  await page.goto('/settings/admin/');
  await expect(page.getByText('This page is for Chipperly’s own team.')).toBeVisible();
});
