import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver } from '../helpers';

test.describe.configure({ mode: 'serial' });

const BETA_INVITE_CODE = 'e2e-beta-code';
const PASSWORD = 'correct-horse-battery-staple';

async function createAccount(page: Page, name: string): Promise<void> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`e2e-org-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/onboarding/kind/');
}

const next = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true });

/** Sign up as an organization and finish the six steps with two groups and three people. */
async function orgSignUp(page: Page, parentEmail: string): Promise<void> {
  await createAccount(page, 'Org Owner');
  await page.getByRole('button', { name: /My organization/ }).click();
  await page.waitForURL('**/onboarding/org/');

  // 1 About
  await expect(page.getByRole('heading', { name: 'About your organization' })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.getByLabel('Organization name', { exact: true }).fill('Sunrise Therapy');
  await page.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'ABA' });
  await page.getByLabel('About how many people do you support?').fill('12');
  await expectNoOverflow(page, 'org setup: about');
  await next(page).click();

  // 2 Role
  await expect(page.getByRole('heading', { name: 'Your role' })).toBeVisible();
  await next(page).click();

  // 3 Groups
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  for (const g of ['North clinic', 'South clinic']) {
    await page.getByLabel('Group name', { exact: true }).fill(g);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${g}` })).toBeVisible();
  }
  await expectNoOverflow(page, 'org setup: groups');
  await next(page).click();

  // 4 People, pasted
  await expect(page.getByRole('heading', { name: 'Add people' })).toBeVisible();
  await page.getByRole('button', { name: 'Paste a list', exact: true }).click();
  await page
    .getByLabel(/One person per line/)
    .fill(`Ava, North clinic\nBen, North clinic\nCy, South clinic, ${parentEmail}`);
  await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(4); // header + 3
  await expectNoOverflow(page, 'org setup: people');
  await page.getByRole('button', { name: 'Add 3 people', exact: true }).click();
  await expect(page.getByText('Added 3 people.')).toBeVisible();
  await next(page).click();

  // 5 Staff, skipped
  await expect(page.getByRole('heading', { name: 'Invite staff' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();

  // 6 Families
  await expect(page.getByRole('heading', { name: 'Families' })).toBeVisible();
  await expect(page.getByText(/We sent 1 family invite, one email per parent/)).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL('**/org/');
}

test.describe('organization', () => {
  test.setTimeout(120_000);
  const parentEmail = `e2e-parent-${Date.now()}@example.com`;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await orgSignUp(page, parentEmail);
  });
  test.afterAll(async () => {
    await page?.close();
  });

  test('sign-up lands on Org home with 3 people and the family invite as Family', async () => {
    await expect(page.getByRole('heading', { name: 'Sunrise Therapy' })).toBeVisible();
    await expect(page.getByText(/\b3 (of \d+ )?people\b/).first()).toBeVisible();
    await expectNoOverflow(page, 'org home');

    await gotoCaregiver(page, '/settings/team/', PASSWORD);
    await expect(page.getByText('Pending invites')).toBeVisible();
    const row = page.locator('div[class*="inviteRow"]', { hasText: parentEmail });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Family');
  });

  test('Org home searches, filters by group, archives and restores', async () => {
    await gotoCaregiver(page, '/org/', PASSWORD);
    const person = (n: string) => page.locator('li[class*="Org_person"]', { hasText: n });
    await expect(person('Ava')).toBeVisible();
    await expect(person('Cy')).toBeVisible();

    // Search
    const search = page.getByRole('searchbox', { name: 'Search people by name' });
    await search.fill('ben');
    await expect(person('Ben')).toBeVisible();
    await expect(person('Ava')).toHaveCount(0);
    await search.fill('');

    // Group filter
    const filter = page.getByRole('group', { name: 'Filter by group' });
    await filter.getByRole('button', { name: 'South clinic', exact: true }).click();
    await expect(person('Cy')).toBeVisible();
    await expect(person('Ava')).toHaveCount(0);
    await filter.getByRole('button', { name: 'All', exact: true }).click();
    await expect(person('Ava')).toBeVisible();

    // Archive Ava
    await page.getByRole('button', { name: 'Actions for Ava', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ava' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(person('Ava')).toHaveCount(0);
    const status = page.getByRole('radiogroup', { name: 'Status' });
    await status.getByRole('radio', { name: 'Archived' }).click();
    await expect(person('Ava')).toBeVisible();
    await expect(person('Ben')).toHaveCount(0);

    // Gone from the profile switcher. The sheet lists what this device holds when it opens, and the
    // archive reaches the device by a sync pull, so open it again until that has landed.
    await expect(async () => {
      await page.locator('header button[class*="profile"]').first().click();
      const switcher = page.getByRole('dialog');
      await expect(switcher.getByRole('button', { name: /Ben/ })).toBeVisible();
      const hasAva = await switcher.getByRole('button', { name: /Ava/ }).count();
      await page.keyboard.press('Escape');
      await expect(switcher).toBeHidden();
      expect(hasAva).toBe(0);
    }).toPass({ timeout: 20_000 });

    // Restore
    await page.getByRole('button', { name: 'Actions for Ava', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ava' }).getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(person('Ava')).toHaveCount(0);
    await status.getByRole('radio', { name: 'Active' }).click();
    await expect(person('Ava')).toBeVisible();
  });

  test('Groups: add, rename, and archive is refused while people are in it', async () => {
    await gotoCaregiver(page, '/org/clusters/', PASSWORD);
    const group = (n: string) => page.locator('li[class*="Org_groupRow"]', { hasText: n });
    await expect(group('North clinic')).toContainText('2 people');
    await expect(group('South clinic')).toContainText('1 person');

    // Add
    await page.getByRole('button', { name: 'Add group', exact: true }).click();
    let sheet = page.getByRole('dialog', { name: 'Add group' });
    await sheet.getByLabel('Group name', { exact: true }).fill('East clinic');
    await sheet.getByRole('button', { name: 'Add group', exact: true }).click();
    await expect(group('East clinic')).toContainText('0 people');

    // Rename
    await page.getByRole('button', { name: 'Rename East clinic', exact: true }).click();
    sheet = page.getByRole('dialog', { name: 'Rename group' });
    await sheet.getByLabel('Group name', { exact: true }).fill('West clinic');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(group('West clinic')).toBeVisible();
    await expect(group('East clinic')).toHaveCount(0);

    // Refused when not empty
    await page.getByRole('button', { name: 'Archive North clinic', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Move or archive the people in this group first.')).toBeVisible();
    await expect(group('North clinic')).toContainText('2 people');

    // An empty one archives
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Archive West clinic', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(group('West clinic')).toHaveCount(0);
    await expectNoOverflow(page, 'org groups');
  });
});

test('a household sign-up still asks the child name first', async ({ browser }) => {
  const page = await browser.newPage();
  await createAccount(page, 'Family Owner');
  await page.getByRole('button', { name: /My family/ }).click();
  await page.waitForURL('**/onboarding/profile/');
  await expect(page.getByRole('heading', { name: "What's their name?" })).toBeVisible();
  await page.close();
});
