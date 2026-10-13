import { createHmac } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

// The admin site (e2e/server.mjs lists admin-<project>@example.com in SUPER_ADMIN_EMAILS). The test server is
// local, so /admin/ shows in place instead of moving to admin.chipperlyapp.com. Two-step sign-in is on, as live.

/** The authenticator code for a base32 key, the way a phone app makes it (RFC 6238). */
function totp(key: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of key.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Opens a page from the admin menu (behind the Menu button on a phone). */
async function go(page: Page, label: string, path: string): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: label, exact: true }).click();
  await page.waitForURL(`**/admin/${path}`);
  await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
}

test('a super admin sets up two-step sign-in, then runs the admin site', async ({ page, browser }, testInfo) => {
  await signUp(page, { name: 'Boss', email: `admin-${testInfo.project.name}@example.com` });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Admin site/ }).click();
  await page.waitForURL('**/admin/');

  // First visit: scan (here: read the key), type a code, save the recovery codes.
  await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  await expectNoOverflow(page, 'two-step setup');
  await page.screenshot({ path: `e2e/screenshots/admin-two-step-${testInfo.project.name}.png`, fullPage: true });
  const key = (await page.locator('code').first().textContent()) ?? '';
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/did not match/)).toBeVisible();
  await page.getByLabel('6-digit code').fill(totp(key));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  await expect(page.locator('pre')).toContainText(/^[A-Z2-7]{4}-[A-Z2-7]{4}/);
  await page.getByRole('button', { name: 'I saved them, continue' }).click();

  // Today: what needs attention, then the numbers.
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sign-ups, last 30 days' })).toBeVisible();
  await expectNoOverflow(page, 'admin today');
  await page.screenshot({ path: `e2e/screenshots/admin-today-${testInfo.project.name}.png`, fullPage: true });

  // People: the early access offer and a trial extension.
  await go(page, 'People', 'people/');
  const codes = page.getByRole('region', { name: 'Early access offers' });
  await codes.getByRole('button', { name: /^EARLYCHIPPER/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Discount (%)').fill('25');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(codes.getByRole('button', { name: /^EARLYCHIPPER/ })).toContainText('25% off annual');

  const people = page.getByRole('region', { name: 'People' });
  await people.getByLabel('Search name or email').fill(`admin-${testInfo.project.name}`);
  await expect(people.getByText(/@example\.com$/)).toHaveCount(1);
  // Signed up inside EARLYCHIPPER's dates, they already have their own code. The offer ends on 24 Oct 2026; after that there is no code.
  const offerOpen = Date.now() <= Date.UTC(2026, 9, 24, 23, 59, 59);
  await expect(people.getByText(offerOpen ? /^Trial: 21 days left · EARLY-/ : /^Trial: 21 days left$/)).toBeVisible();
  await people.getByRole('button', { name: '+7 days', exact: true }).click();
  await expect(people.getByText(/^Trial: 28 days left/)).toBeVisible();
  await expectNoOverflow(page, 'admin people');
  await page.screenshot({ path: `e2e/screenshots/admin-people-${testInfo.project.name}.png`, fullPage: true });

  // Payments: with no Stripe keys in the harness it says so and lists nothing.
  await go(page, 'Payments', 'payments/');
  await expect(page.getByText('Payments are switched off on this server.').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Messages from Stripe' })).toContainText('Nothing has arrived yet.');
  await expectNoOverflow(page, 'payments log');

  // Every other page opens and fits the screen.
  for (const [label, path] of [
    ['Waitlist', 'waitlist/'],
    ['Organizations', 'orgs/'],
    ['Growth', 'growth/'],
    ['Subscriptions', 'subscriptions/'],
    ['Failed payments', 'failed-payments/'],
    ['Feedback', 'feedback/'],
    ['Moderation', 'moderation/'],
    ['App errors', 'errors/'],
    ['Activity', 'activity/'],
    ['Admin team', 'team/'],
    ['Sync health', 'sync/'],
    ['Backups', 'backups/'],
  ] as const) {
    await go(page, label, path);
    await expectNoOverflow(page, `admin ${path}`);
    await page.screenshot({ path: `e2e/screenshots/admin-${path.replace('/', '')}-${testInfo.project.name}.png`, fullPage: true });
  }

  // The pass is kept: a reload goes straight back in, no code asked.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Backups' })).toBeVisible();
  // A moderator, given the role by email before they have an account.
  const modEmail = `mod-${testInfo.project.name}-${Date.now()}@example.com`;
  await go(page, 'Admin team', 'team/');
  await page.getByLabel('Email', { exact: true }).fill(modEmail);
  await page.getByRole('radio', { name: 'Moderator' }).click();
  await page.getByRole('button', { name: 'Add as Moderator' }).click();
  await expect(page.getByRole('row', { name: new RegExp(modEmail) })).toContainText('Not signed up yet');

  const modPage = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
  await signUp(modPage, { name: 'Mod', email: modEmail });
  await modPage.goto('/admin/');
  await expect(modPage.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
  const modKey = (await modPage.locator('code').first().textContent()) ?? '';
  await modPage.getByLabel('6-digit code').fill(totp(modKey));
  await modPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await modPage.getByRole('button', { name: 'I saved them, continue' }).click();
  // Today is not theirs: they land on Moderation, and it is the only page in their menu.
  await modPage.waitForURL('**/admin/moderation/');
  await expect(modPage.getByRole('heading', { level: 1, name: 'Moderation' })).toBeVisible();
  const menu = modPage.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await expect(modPage.getByRole('navigation', { name: 'Admin' }).getByRole('link')).toHaveText(['Moderation']);
  await modPage.close();
});

test('everyone else gets no admin row and no admin site', async ({ page }) => {
  await signUp(page, { name: 'Not Boss' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Admin site/ })).toHaveCount(0);
  await page.goto('/admin/');
  await expect(page.getByText(/is not on Chipperly’s team list/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
});
