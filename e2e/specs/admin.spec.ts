import { test, expect } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

// The admin site (e2e/server.mjs lists admin-<project>@example.com in SUPER_ADMIN_EMAILS). The test server is
// local, so /admin/ shows in place instead of moving to admin.chipperlyapp.com.
test('a super admin sees the dashboard, sets the early access discount, and extends a trial', async ({ page }, testInfo) => {
  await signUp(page, { name: 'Boss', email: `admin-${testInfo.project.name}@example.com` });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Admin site/ }).click();
  await page.waitForURL('**/admin/');
  await expect(page.getByText(/Super admin$/)).toBeVisible();
  await expect(page.getByText('People', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sign-ups, last 30 days' })).toBeVisible();

  const codes = page.getByRole('region', { name: 'Early access offers' });
  await codes.getByRole('button', { name: /^EARLYCHIPPER/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Discount (%)').fill('25');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(codes.getByRole('button', { name: /^EARLYCHIPPER/ })).toContainText('25% off annual');

  const people = page.getByRole('region', { name: 'People' });
  await people.getByLabel('Search name or email').fill(`admin-${testInfo.project.name}`);
  // Wait for the search to narrow the list to just them (it runs a beat after typing).
  await expect(people.getByText(/@example\.com$/)).toHaveCount(1);
  // Signed up inside EARLYCHIPPER's dates, they already have their own code. The offer ends on 24 Oct 2026; after that there is no code.
  const offerOpen = Date.now() <= Date.UTC(2026, 9, 24, 23, 59, 59);
  await expect(people.getByText(offerOpen ? /^Trial: 21 days left · EARLY-/ : /^Trial: 21 days left$/)).toBeVisible();
  await people.getByRole('button', { name: '+7 days', exact: true }).click();
  await expect(people.getByText(/^Trial: 28 days left/)).toBeVisible();
  await expectNoOverflow(page, 'admin dashboard');
  await page.screenshot({ path: `e2e/screenshots/admin-people-${testInfo.project.name}.png`, fullPage: true });

  // The payments log is read-only; with no Stripe keys in the harness it says so and lists nothing.
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Payments' }).click();
  await page.waitForURL('**/admin/payments/');
  await expect(page.getByText('Payments are switched off on this server.').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Messages from Stripe' })).toContainText('Nothing has arrived yet.');
  await expectNoOverflow(page, 'payments log');

  // Every other admin page opens and fits the screen.
  for (const [label, path] of [['Organizations', 'orgs'], ['Subscriptions', 'subscriptions'], ['Feedback', 'feedback'], ['Activity', 'activity'], ['Sync health', 'sync'], ['Backups', 'backups']] as const) {
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(`**/admin/${path}/`);
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
    await expectNoOverflow(page, `admin ${path}`);
  }
});

test('everyone else gets no admin row and no admin site', async ({ page }) => {
  await signUp(page, { name: 'Not Boss' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Admin site/ })).toHaveCount(0);
  await page.goto('/admin/');
  await expect(page.getByText(/is not on Chipperly’s team list/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
});
