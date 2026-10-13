import { test, expect, type Page } from '@playwright/test';
import { gotoCaregiver } from '../helpers';

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
const lastMail = (page: Page) => page.request.get('/api/testing/last-mail').then((r) => r.json());

/** Owner signs up as an organization with one group and two people: Ava and Ben. */
async function orgSignUp(page: Page): Promise<void> {
  await page.goto('/sign-up/');
  await fillSignUp(page, 'Org Owner', `e2e-fam-owner-${Date.now()}@example.com`);
  await page.waitForURL('**/onboarding/kind/');
  await page.getByRole('button', { name: /My organization/ }).click();
  await page.waitForURL('**/onboarding/org/');
  await page.getByLabel('Organization name', { exact: true }).fill('Family Therapy');
  await page.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'ABA' });
  await page.getByLabel('About how many people do you support?').fill('12');
  await next(page).click();
  await next(page).click(); // role
  await page.getByLabel('Group name', { exact: true }).fill('North');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove North' })).toBeVisible();
  await next(page).click();
  await page.getByRole('button', { name: 'Paste a list', exact: true }).click();
  await page.getByLabel(/One person per line/).fill('name, group\nAva, North\nBen, North');
  await page.getByRole('button', { name: 'Add to list', exact: true }).click();
  await page.getByRole('button', { name: 'Add 2 people', exact: true }).click();
  await expect(page.getByText('Added 2 people.')).toBeVisible();
  await next(page).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click(); // staff
  await page.getByRole('button', { name: 'Done', exact: true }).click(); // families
  await page.waitForURL('**/org/');
}

test.describe('organization families', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit: two contexts and a full sign-up are too heavy here, same as team-roles.');
  test.setTimeout(150_000);

  let owner: Page;
  let family: Page;
  const familyEmail = `e2e-family-${Date.now()}@example.com`;

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newPage();
    await orgSignUp(owner);
    await gotoCaregiver(owner, '/settings/team/', PASSWORD);
    await owner.getByRole('button', { name: 'Invite', exact: true }).click();
    const sheet = owner.getByRole('dialog', { name: 'Invite' });
    await sheet.getByLabel('Email', { exact: true }).fill(familyEmail);
    await sheet.getByRole('radiogroup', { name: 'Role' }).getByRole('radio', { name: 'Family' }).click();
    await sheet.getByRole('checkbox', { name: /^Ava,/ }).click();
    await sheet.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(sheet.getByLabel('Invite link')).toHaveValue(/token=/);
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    const token = /token=([\w-]+)/.exec((await lastMail(owner))?.text ?? '')?.[1] ?? '';
    expect(token).not.toBe('');

    family = await (await browser.newContext()).newPage();
    await family.goto(`/invite/?token=${token}`);
    await family.getByRole('link', { name: 'Create account', exact: true }).click();
    await family.waitForURL('**/sign-up/');
    await fillSignUp(family, 'Fran Family', familyEmail);
    await family.waitForURL('**/invite/?token=**');
    await family.getByRole('button', { name: 'Accept invite', exact: true }).click();
    await family.waitForURL(/\/(today|org)\//, { timeout: 10_000 });
  });
  test.afterAll(async () => {
    await family?.context().close();
    await owner?.close();
  });

  test('a Family viewer opens the report for their person, with charts and the CSV download', async () => {
    await family.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await family.waitForURL('**/settings/');
    await family.getByRole('button', { name: /^Reports/ }).click();
    await family.waitForURL('**/reports/**');
    await expect(family.getByRole('heading', { name: 'Ava' })).toBeVisible({ timeout: 20_000 });
    await expect(family.getByRole('img', { name: /^Tasks/ })).toBeVisible();
    await expect(family.getByRole('img', { name: /^Chips earned each day/ })).toBeVisible();
    await expect(family.getByRole('img', { name: /^Feelings/ })).toBeVisible();
    const [download] = await Promise.all([family.waitForEvent('download'), family.getByRole('button', { name: 'Download CSV', exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(/^Ava-report-.*\.csv$/);
  });

  test('archiving Ava gives her family a copy of their own and leaves the org copy', async () => {
    await gotoCaregiver(owner, '/org/', PASSWORD);
    await owner.getByRole('button', { name: 'Actions for Ava', exact: true }).click();
    await owner.getByRole('dialog', { name: 'Ava' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(owner.locator('li[class*="Org_person"]', { hasText: 'Ava' })).toHaveCount(0);

    // The handover link is in the mail, the banner is in the app.
    let mail = await lastMail(owner);
    await expect.poll(async () => (mail = await lastMail(owner))?.to, { timeout: 15_000 }).toBe(familyEmail);
    const token = /\/keep\/\?token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
    expect(token).not.toBe('');

    await family.goto('/org/');
    await expect(family.getByRole('status').filter({ hasText: 'no longer covers Ava' })).toBeVisible({ timeout: 20_000 });
    await family.goto(`/keep/?token=${token}`);
    await expect(family.getByRole('heading', { name: "Keep Ava's Chipperly" })).toBeVisible();
    await family.getByRole('button', { name: "Keep Ava's Chipperly", exact: true }).click();
    await family.waitForURL('**/today/', { timeout: 30_000 });

    // The copy has Ava's day and rewards.
    await expect(family.getByRole('checkbox').first()).toBeVisible({ timeout: 20_000 });
    await family.getByRole('link', { name: 'Chips', exact: true }).first().click();
    await family.waitForURL('**/chips/');
    await expect(family.getByText('Choose a reward').or(family.getByRole('radio').first()).first()).toBeVisible({ timeout: 20_000 });

    // The org still has Ava, archived.
    await gotoCaregiver(owner, '/org/', PASSWORD);
    await owner.getByRole('radiogroup', { name: 'Status' }).getByRole('radio', { name: 'Archived' }).click();
    await expect(owner.locator('li[class*="Org_person"]', { hasText: 'Ava' })).toBeVisible();
  });
});
