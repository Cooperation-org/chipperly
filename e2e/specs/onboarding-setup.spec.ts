import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

const BETA_INVITE_CODE = 'e2e-beta-code';
const PASSWORD = 'correct-horse-battery-staple';

async function createAccount(page: Page, name: string): Promise<void> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`e2e-setup-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/onboarding/kind/');
}

// S4b, the setup interview: the answers seed an age-appropriate starter
// plan (packages/shared/src/constants/setup.ts buildSeed) instead of the
// fixed default lists every profile used to get.
test.describe('onboarding setup interview', () => {
  test('a family walks the questions for a teenager', async ({ browser }) => {
    // Its own context: each test here signs up a fresh account.
    const page = await browser.newPage();
    await createAccount(page, 'Setup Tester');
    await page.getByRole('button', { name: /My family/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await page.getByLabel('Name', { exact: true }).fill('Riley');
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Choose a picture' }).getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Age: tapping a band advances by itself.
    await expect(page.getByRole('heading', { name: 'How old is Riley?' })).toBeVisible();
    await expectNoOverflow(page, 'setup: age band');
    await page.getByRole('button', { name: '13 to 17' }).click();

    // Week: School starts pre-checked for a teen; keep it.
    await expect(page.getByRole('heading', { name: "What's in a typical week?" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'School', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Routines: Morning starts pre-checked; add Bedtime.
    await expect(page.getByRole('heading', { name: 'Which routines should we start with?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Morning routine' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Bedtime', exact: true }).click();
    await expectNoOverflow(page, 'setup: routines');
    await snap(page, 'setup-routines');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Guided rewards setup: one place (Home), three anytime choices, then rewards earned with chips.
    await expect(page.getByRole('heading', { name: 'Where will Riley use Chipperly?' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Main place' })).toHaveValue('Home');
    await expectNoOverflow(page, 'setup: places');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Pick three things Riley can choose anytime' })).toBeVisible();
    await page.getByRole('button', { name: 'Music', exact: true }).click();
    await page.getByLabel('Add your own', { exact: true }).fill('Skateboarding');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skateboarding' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('2 of 3 picked')).toBeVisible();
    await expectNoOverflow(page, 'setup: free choices');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Pick three rewards Riley earns with chips' })).toBeVisible();
    await page.getByRole('button', { name: 'Pizza night', exact: true }).click();
    await expect(page.getByText('1 of 3 picked')).toBeVisible();
    await expectNoOverflow(page, 'setup: earned rewards');
    await page.getByRole('button', { name: "Create Riley's plan", exact: true }).click();

    // Ready summarizes what was actually made.
    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByRole('heading', { name: 'Riley is ready.' })).toBeVisible();
    await expect(page.getByText(/Morning Routine · \d+ steps/)).toBeVisible();
    await expect(page.getByText(/Bedtime Routine · \d+ steps/)).toBeVisible();
    await expect(page.getByText('Free choices: Music, Skateboarding')).toBeVisible();
    await expect(page.getByText('Earned with chips: Pizza night (5)')).toBeVisible();
    await expectNoOverflow(page, 'setup: ready summary');
    await snap(page, 'setup-ready-summary');
    await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
    await page.waitForURL('**/today/');

    // The seeded plan fits a teen: the routines are on Today, the young-child
    // anchors are not.
    await expect(page.getByText('Morning Routine').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Bedtime Routine').first()).toBeVisible();
    await expect(page.getByText('Bath Time')).toHaveCount(0);

    // The chosen rewards exist (created on this device, then synced).
    await gotoTab(page, 'chips');
    await page.getByRole('button', { name: /Choose a reward/ }).click();
    const picker = page.getByRole('dialog');
    await expect(picker.getByText('Pizza night')).toBeVisible();
    await page.close();
  });

  test('a "Myself" account goes straight to the questions and can skip them', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Solo Tester');
    await page.getByRole('button', { name: /Myself/ }).click();
    await page.waitForURL('**/onboarding/profile/');

    // No name form and no age question for a self-managed account.
    await expect(page.getByRole('heading', { name: "What's in a typical week?" })).toBeVisible();
    await page.getByRole('button', { name: 'Skip setup', exact: true }).click();

    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByRole('heading', { name: 'Solo Tester is ready.' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
    await page.waitForURL('**/today/');
    await page.close();
  });
});
