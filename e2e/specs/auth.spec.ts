import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('auth', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S1 welcome / sign in renders', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'chipperly' })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
    // NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset for this build, so no OAuth button.
    await expect(page.getByRole('button', { name: /Google/i })).toHaveCount(0);
    await expectNoOverflow(page, 'S1 welcome');
    await snap(page, 's1-welcome');
  });

  let email = '';
  let password = '';

  test('S2 create account', async () => {
    await page.goto('/sign-up/');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expectNoOverflow(page, 'S2 create account');
    await snap(page, 's2-create-account');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    email = `e2e-auth-${unique}@example.com`;
    password = 'correct-horse-battery-staple';

    await page.getByLabel('Name', { exact: true }).fill('Auth Tester');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForURL('**/onboarding/kind/');
  });

  test('S3 who is this for', async () => {
    await expect(page.getByRole('heading', { name: 'Who is Chipperly for?' })).toBeVisible();
    await expectNoOverflow(page, 'S3 onboarding kind');
    await snap(page, 's3-onboarding-kind');
    await page.getByRole('button', { name: /My family/ }).click();
    await page.waitForURL('**/onboarding/profile/');
  });

  test('S4 first profile', async () => {
    await expect(page.getByRole('heading', { name: 'Who is this for?' })).toBeVisible();
    await expectNoOverflow(page, 'S4 onboarding profile');
    await snap(page, 's4-onboarding-profile');

    await page.getByLabel('Name', { exact: true }).fill('Benny');
    // PicturePicker's emoji grid is open by default (ux-plan.md: "Emoji is
    // default so nobody is blocked by a photo"), so no toggle click is needed
    // here — clicking the "Emoji" button would instead *close* it.
    await page.getByRole('radiogroup', { name: 'Choose a picture' }).getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForURL('**/onboarding/ready/');
  });

  test('S5 ready -> Today', async () => {
    await expect(page.getByRole('heading', { name: /is ready\.$/ })).toBeVisible();
    await expectNoOverflow(page, 'S5 ready');
    await snap(page, 's5-ready');

    await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
    await page.waitForURL('**/today/');
    await expectNoOverflow(page, 'S6 today (post-onboarding)');
    await snap(page, 's6-today');
  });

  test('forgot password page', async () => {
    await page.goto('/forgot-password/');
    await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
    await expectNoOverflow(page, 'forgot password');
    await snap(page, 'forgot-password');
  });

  test('verify page with a bad token shows the expired sentence', async () => {
    await page.goto('/verify/?token=not-a-real-token');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expectNoOverflow(page, 'verify bad token');
    await snap(page, 'verify-expired');
  });

  test('sign out from /settings/account/ returns to /', async () => {
    await page.goto('/settings/account/');
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
    await expectNoOverflow(page, 'account');
    await snap(page, 's30-account');

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('http://127.0.0.1:8123/');
    await expect(page.getByRole('heading', { name: 'chipperly' })).toBeVisible();
  });
});
