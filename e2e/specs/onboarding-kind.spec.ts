import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver } from '../helpers';

const BETA_INVITE_CODE = 'e2e-beta-code';
const PASSWORD = 'correct-horse-battery-staple';

async function createAccount(page: Page, name: string): Promise<string> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-kind-${unique}@example.com`;
  await page.goto('/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/onboarding/kind/');
  return email;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// Setup changes per plan type: Myself asks what to call you, Someone I support adds helpers and an own
// login, My family lists up to six people on one screen.
test.describe('setup per plan type', () => {
  test.setTimeout(120_000);

  test('Myself: the name is asked first, never an email, and a support team can be added at the end', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Solo Person');
    await page.getByRole('button', { name: /Myself/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('Solo Person');
    await page.getByLabel('Your name').fill('Sam');
    await button(page, 'Continue').click();
    await button(page, 'Skip setup').click();

    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByRole('heading', { name: 'Sam is ready.' })).toBeVisible();
    await button(page, 'Add someone to your support team').click();
    const sheet = page.getByRole('dialog', { name: 'Invite' });
    await expect(sheet.getByLabel('Email')).toBeVisible();
    await page.keyboard.press('Escape');
    await button(page, 'Go to Today').click();
    await page.waitForURL('**/today/');
    await page.close();
  });

  test('Myself: a sign-up name that is an email is not prefilled', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'who@example.com');
    await page.getByRole('button', { name: /Myself/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await expect(page.getByLabel('Your name')).toHaveValue('');
    await expect(button(page, 'Continue')).toBeDisabled();
    await page.close();
  });

  test('Someone I support: helpers, and their own login with a temporary password that must be changed', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Support Tester');
    await page.getByRole('button', { name: /Someone I support/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await page.getByLabel('Name', { exact: true }).fill('Jo');
    await button(page, 'Continue').click();

    await expect(page.getByRole('heading', { name: 'Who else helps Jo?' })).toBeVisible();
    await expectNoOverflow(page, 'supported: helpers');
    await page.getByLabel('Email', { exact: true }).fill('helper@example.com');
    await page.getByRole('radio', { name: 'Viewer' }).click();
    await button(page, 'Add').click();
    await expect(page.getByText('helper@example.com (Viewer)')).toBeVisible();
    await button(page, 'Continue').click();

    await expect(page.getByRole('switch', { name: 'Jo will have their own login' })).toBeVisible();
    await page.getByRole('switch', { name: 'Jo will have their own login' }).click();
    // The invite email is the default.
    await expect(page.getByRole('radio', { name: 'Send an invite email' })).toBeChecked();
    await page.getByRole('radio', { name: 'Set a temporary password' }).check();
    const joEmail = `e2e-jo-${Date.now()}@example.com`;
    await page.getByLabel("Jo's email").fill(joEmail);
    await page.getByLabel('Temporary password').fill('short');
    await button(page, 'Continue').click();
    await expect(page.getByRole('alert')).toContainText('at least 8');
    await page.getByLabel('Temporary password').fill('temporary-pass-1');
    await button(page, 'Continue').click();

    await button(page, 'Skip setup').click();
    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByRole('heading', { name: 'Jo is ready.' })).toBeVisible();

    // Jo signs in with the temporary password and has to choose their own before anything else.
    const jo = await browser.newPage();
    await jo.goto('/');
    await jo.getByLabel('Email', { exact: true }).fill(joEmail);
    await jo.getByLabel('Password', { exact: true }).fill('temporary-pass-1');
    await button(jo, 'Sign in').click();
    await jo.waitForURL('**/change-password/');
    await jo.getByLabel('New password', { exact: true }).fill('my-own-password-2');
    await jo.getByLabel('Confirm password', { exact: true }).fill('my-own-password-2');
    await button(jo, 'Save and continue').click();
    await jo.waitForURL(/\/(child|today|onboarding\/device)\//);
    await jo.close();
    await page.close();
  });

  test('My family: up to six people on one screen, Same as the first, a second admin and viewers', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Family Tester');
    await page.getByRole('button', { name: /My family/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await expect(page.getByRole('heading', { name: 'Who is in your family?' })).toBeVisible();
    await expect(page.getByText('1 of 6', { exact: true })).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('Ava');
    await button(page, '+ Add another person').click();
    await page.getByLabel('Name of person 2').fill('Ben');
    await expect(page.getByText('2 of 6', { exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'I will use Chipperly too' }).click();
    await expect(page.getByText('3 of 6', { exact: true })).toBeVisible();
    await page.getByLabel('Your name').fill('Sam');
    // Six is the most: the admin counts, so three more rows fill it.
    for (let n = 3; n <= 5; n += 1) await button(page, '+ Add another person').click();
    await expect(page.getByText('6 of 6', { exact: true })).toBeVisible();
    await expect(button(page, '+ Add another person')).toBeDisabled();
    await expectNoOverflow(page, 'family: six people');
    for (let n = 5; n >= 3; n -= 1) await button(page, `Remove person ${n}`).click();
    await expect(page.getByText('3 of 6', { exact: true })).toBeVisible();
    await button(page, 'Continue').click();

    // Ava answers the questions once.
    await expect(page.getByRole('heading', { name: 'How old is Ava?' })).toBeVisible();
    await page.getByRole('button', { name: '2 to 7' }).click();
    for (let n = 0; n < 4; n += 1) await button(page, 'Continue').click();
    await button(page, "Save Ava's plan").click();

    // Ben copies her answers in one tap.
    await expect(page.getByRole('heading', { name: 'How old is Ben?' })).toBeVisible();
    await button(page, 'Same as Ava').click();

    // The admin skips.
    await expect(page.getByRole('heading', { name: 'How old is Sam?' })).toBeVisible();
    await button(page, 'Skip setup').click();

    await expect(page.getByRole('heading', { name: 'Invite a second admin' })).toBeVisible();
    await page.getByLabel('Second admin email (optional)').fill('second@example.com');
    await page.getByLabel('Viewer email').fill('gran@example.com');
    await button(page, 'Finish').click();

    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByText('3 people are set up: Ava, Ben, Sam.')).toBeVisible();
    await button(page, 'Go to Today').click();
    await page.waitForURL('**/today/');

    // The two invites went out, with the right roles.
    await gotoCaregiver(page, '/settings/team/', PASSWORD);
    await expect(page.getByText('Pending invites')).toBeVisible();
    await expect(page.locator('div[class*="inviteRow"]', { hasText: 'second@example.com' })).toContainText('Admin');
    await expect(page.locator('div[class*="inviteRow"]', { hasText: 'gran@example.com' })).toContainText('Viewer');
    await page.close();
  });
});
