import { test, expect, type Browser, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

const ROLE_NAME = { admin: 'Admin', member: 'Support team', viewer: 'Viewer' } as const;
const PASSWORD = 'correct-horse-battery-staple';

async function addPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add person' });
  await sheet.getByLabel('Name', { exact: true }).fill(name);
  await sheet.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('button[class*="ProfilesScreen_row"]', { hasText: name })).toBeVisible();
}

/** Admin sends an invite from Settings > Team and returns the token from the mail. */
async function invite(page: Page, email: string, role: keyof typeof ROLE_NAME, people: string[]): Promise<string> {
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite' });
  await sheet.getByLabel('Email', { exact: true }).fill(email);
  await sheet.getByRole('radiogroup', { name: 'Role' }).getByRole('radio', { name: ROLE_NAME[role] }).click();
  if (role !== 'admin') {
    for (const p of people) await sheet.getByRole('checkbox', { name: new RegExp(`^${p},`) }).click();
  }
  await sheet.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(sheet.getByLabel('Invite link')).toHaveValue(/token=/);
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(sheet).toBeHidden();
  const mail = await page.request.get('/api/testing/last-mail').then((r) => r.json());
  expect(mail?.to).toBe(email);
  return /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
}

/** A brand new person follows the invite link, creates an account, and accepts. */
async function acceptAsNewUser(browser: Browser, token: string, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/invite/?token=${token}`);
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/invite/?token=**');
  await page.getByRole('button', { name: 'Accept invite', exact: true }).click();
  await page.waitForURL('**/today/', { timeout: 10_000 });
  return { context, page };
}

test.describe('viewer and support team', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit: two contexts and a full sign-up are too heavy here, same as settings S26/S27.');
  test.setTimeout(120_000);

  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    admin = await browser.newPage();
    await signUp(admin, { name: 'Roles Admin' });
    await expect(admin.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await gotoCaregiver(admin, '/settings/profiles/', PASSWORD);
    await addPerson(admin, 'Ada');
    await gotoCaregiver(admin, '/settings/team/', PASSWORD);
  });

  test.afterAll(async () => {
    await admin.close();
  });

  test('a viewer sees View only, has no edit buttons, and a check does not change', async ({ browser }) => {
    const email = `e2e-viewer-${Date.now()}@example.com`;
    const token = await invite(admin, email, 'viewer', ['Benny']);
    const { context, page } = await acceptAsNewUser(browser, token, email, 'Vera Viewer');
    try {
      await expect(page.getByRole('status').filter({ hasText: 'View only' })).toBeVisible();
      const check = page.getByRole('checkbox', { name: /^Wake Up,/ });
      await expect(check).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: 'Add activity', exact: true })).toHaveCount(0);
      await expect(check).toBeDisabled();
      await check.click({ force: true });
      await expect(check).toHaveAttribute('aria-checked', 'false');
      await expectNoOverflow(page, 'viewer today');
    } finally {
      await context.close();
    }
  });

  test('an admin changes Support team to Viewer and edits their people', async ({ browser }) => {
    const email = `e2e-support-${Date.now()}@example.com`;
    const token = await invite(admin, email, 'member', ['Benny']);
    const { context } = await acceptAsNewUser(browser, token, email, 'Sam Support');
    try {
      await gotoCaregiver(admin, '/settings/team/', PASSWORD);
      const row = admin.locator('button[class*="memberEdit"]', { hasText: 'Sam Support' });
      await expect(row).toContainText('Support team');
      await row.click();
      const sheet = admin.getByRole('dialog', { name: 'Sam Support' });
      await sheet.getByRole('radiogroup', { name: 'Role' }).getByRole('radio', { name: 'Viewer' }).click();
      await sheet.getByRole('checkbox', { name: /^Ada,/ }).click();
      await sheet.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect(row).toContainText('Viewer');
      await expect(row.locator('xpath=ancestor::div[contains(@class,"memberInfo")]').getByText('Sees: Ada')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('two accounts: the switcher groups by account and search filters', async ({ browser }) => {
    await gotoCaregiver(admin, '/settings/profiles/', PASSWORD);
    for (const n of ['Bo', 'Cy', 'Di', 'Gus']) await addPerson(admin, n);

    // A second person with their own account, invited to this one as admin.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const other = await signUp(page, { name: 'Two Accounts' });
      // A household account holds 6 people, so both accounts need some to pass the 8 where search appears.
      await gotoCaregiver(page, '/settings/profiles/', PASSWORD);
      for (const n of ['Flo', 'Eve', 'Fay']) await addPerson(page, n);
      await gotoCaregiver(admin, '/settings/team/', PASSWORD);
      const token = await invite(admin, other.email, 'admin', []);
      await page.goto(`/invite/?token=${token}`);
      await page.getByRole('button', { name: 'Accept invite', exact: true }).click();
      await page.waitForURL('**/today/', { timeout: 10_000 });

      await page.locator('header button[class*="profile"]').first().click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(2, { timeout: 20_000 });
      const search = sheet.getByRole('searchbox', { name: 'Search people by name' });
      await expect(search).toBeVisible();
      await search.fill('gus');
      await expect(sheet.getByRole('heading', { level: 3 })).toHaveCount(1);
      await expect(sheet.getByRole('button', { name: /Gus/ })).toBeVisible();
      await expect(sheet.getByRole('button', { name: /Flo/ })).toHaveCount(0);
      await search.fill('zzz');
      await expect(sheet.getByText('No one matches.')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
