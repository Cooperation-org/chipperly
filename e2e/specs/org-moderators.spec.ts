import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver } from '../helpers';

test.describe.configure({ mode: 'serial' });

const BETA_INVITE_CODE = 'e2e-beta-code';
const PASSWORD = 'correct-horse-battery-staple';

async function fillSignUp(page: Page, name: string, email: string): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

const next = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true });

/** Owner signs up as an organization with groups North and South, Ava and Ben in North, Cy in South. */
async function orgSignUp(page: Page): Promise<void> {
  await page.goto('/sign-up/');
  await fillSignUp(page, 'Org Owner', `e2e-mod-owner-${Date.now()}@example.com`);
  await page.waitForURL('**/onboarding/kind/');
  await page.getByRole('button', { name: /My organization/ }).click();
  await page.waitForURL('**/onboarding/org/');
  await page.getByLabel('Organization name', { exact: true }).fill('Moderated Therapy');
  await page.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'ABA' });
  await page.getByLabel('About how many people do you support?').fill('12');
  await next(page).click();
  await next(page).click(); // role
  for (const g of ['North', 'South']) {
    await page.getByLabel('Group name', { exact: true }).fill(g);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${g}` })).toBeVisible();
  }
  await next(page).click();
  await page.getByRole('button', { name: 'Paste a list', exact: true }).click();
  await page.getByLabel(/One person per line/).fill('name, group\nAva, North\nBen, North\nCy, South');
  await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await page.getByRole('button', { name: 'Add 3 people', exact: true }).click();
  await expect(page.getByText('Added 3 people.')).toBeVisible();
  await next(page).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click(); // staff
  await page.getByRole('button', { name: 'Done', exact: true }).click(); // families
  await page.waitForURL('**/org/');
}

test.describe('organization moderators', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit: two contexts and a full sign-up are too heavy here, same as team-roles.');
  test.setTimeout(150_000);

  let owner: Page;

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newPage();
    await orgSignUp(owner);
  });
  test.afterAll(async () => {
    await owner?.close();
  });

  test('the Team screen offers Moderator and org names, and a moderator sees only their group', async ({ browser }) => {
    await gotoCaregiver(owner, '/settings/team/', PASSWORD);
    await owner.getByRole('button', { name: 'Invite', exact: true }).click();
    const sheet = owner.getByRole('dialog', { name: 'Invite' });
    const roles = sheet.getByRole('radiogroup', { name: 'Role' });
    for (const label of ['Org admin', 'Moderator', 'Staff', 'Family']) await expect(roles.getByRole('radio', { name: label })).toBeVisible();

    const email = `e2e-moderator-${Date.now()}@example.com`;
    const staffEmail = `e2e-staff-${Date.now()}@example.com`;
    await sheet.getByLabel('Email', { exact: true }).fill(email);
    await roles.getByRole('radio', { name: 'Moderator' }).click();
    await sheet.getByRole('checkbox', { name: /^North,/ }).click();
    await sheet.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(sheet.getByLabel('Invite link')).toHaveValue(/token=/);
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    const mail = await owner.request.get('/api/testing/last-mail').then((r) => r.json());
    const token = /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    expect(token).not.toBe('');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`/invite/?token=${token}`);
      await page.getByRole('link', { name: 'Create account', exact: true }).click();
      await page.waitForURL('**/sign-up/');
      await fillSignUp(page, 'Mo Moderator', email);
      await page.waitForURL('**/invite/?token=**');
      await page.getByRole('button', { name: 'Accept invite', exact: true }).click();
      await page.waitForURL(/\/(today|org)\//, { timeout: 10_000 });

      await gotoCaregiver(page, '/org/', PASSWORD);
      const person = (n: string) => page.locator('li[class*="Org_person"]', { hasText: n });
      await expect(person('Ava')).toBeVisible({ timeout: 20_000 });
      await expect(person('Ben')).toBeVisible();
      await expect(person('Cy')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Actions for Ava', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add people', exact: true })).toHaveCount(0);
      await expectNoOverflow(page, 'moderator org home');

      await gotoCaregiver(page, '/org/clusters/', PASSWORD);
      await expect(page.locator('li[class*="Org_groupRow"]', { hasText: 'North' })).toBeVisible();
      await expect(page.locator('li[class*="Org_groupRow"]', { hasText: 'South' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add group', exact: true })).toHaveCount(0);

      await gotoCaregiver(page, '/settings/team/', PASSWORD);
      const roles2 = await (async () => {
        await page.getByRole('button', { name: 'Invite', exact: true }).click();
        return page.getByRole('dialog', { name: 'Invite' }).getByRole('radiogroup', { name: 'Role' });
      })();
      await expect(roles2.getByRole('radio', { name: 'Staff' })).toBeVisible();
      await expect(roles2.getByRole('radio', { name: 'Moderator' })).toHaveCount(0);
      await expect(roles2.getByRole('radio', { name: 'Org admin' })).toHaveCount(0);

      // The moderator hands out Staff in group North. South is not offered.
      const invSheet = page.getByRole('dialog', { name: 'Invite' });
      await expect(invSheet.getByRole('checkbox', { name: /^South,/ })).toHaveCount(0);
      await invSheet.getByLabel('Email', { exact: true }).fill(staffEmail);
      await roles2.getByRole('radio', { name: 'Staff' }).click();
      await invSheet.getByRole('checkbox', { name: /^North,/ }).click();
      await invSheet.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(invSheet.getByLabel('Invite link')).toHaveValue(/token=/);
      await invSheet.getByRole('button', { name: 'Done', exact: true }).click();
      const staffMail = await page.request.get('/api/testing/last-mail').then((r) => r.json());
      expect(staffMail?.to).toBe(staffEmail);
      const staffToken = /token=([\w-]+)/.exec(staffMail?.text ?? '')?.[1] ?? '';
      expect(staffToken).not.toBe('');

      // That Staff member sees North's people, and only them.
      const staffContext = await browser.newContext();
      const staff = await staffContext.newPage();
      try {
        await staff.goto(`/invite/?token=${staffToken}`);
        await staff.getByRole('link', { name: 'Create account', exact: true }).click();
        await staff.waitForURL('**/sign-up/');
        await fillSignUp(staff, 'Sol Staff', staffEmail);
        await staff.waitForURL('**/invite/?token=**');
        await staff.getByRole('button', { name: 'Accept invite', exact: true }).click();
        await staff.waitForURL(/\/(today|org)\//, { timeout: 10_000 });
        await gotoCaregiver(staff, '/org/', PASSWORD);
        const sp = (n: string) => staff.locator('li[class*="Org_person"]', { hasText: n });
        await expect(sp('Ava')).toBeVisible({ timeout: 20_000 });
        await expect(sp('Ben')).toBeVisible();
        await expect(sp('Cy')).toHaveCount(0);
      } finally {
        await staffContext.close();
      }
    } finally {
      await context.close();
    }
  });

  test('an admin assigns Staff to a group from the Groups screen', async () => {
    await gotoCaregiver(owner, '/org/clusters/', PASSWORD);
    await owner.getByRole('button', { name: 'Staff in North', exact: true }).click();
    const sheet = owner.getByRole('dialog', { name: 'Staff in North' });
    await expect(sheet.getByText('Mo Moderator')).toBeVisible();
    await expect(sheet.getByRole('checkbox', { name: /^Mo Moderator,/ })).toHaveAttribute('aria-checked', 'true');
    await expectNoOverflow(owner, 'org groups staff sheet');
  });
});
