import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

/**
 * The owner's decision was "signed-in app users post; reading is public". The pages
 * first shipped under the (caregiver) group, so RequireSession bounced every
 * signed-out reader and the feature was effectively private. These tests exist to
 * keep that from silently happening again: they read the community with NO account.
 */
test.describe('community, read without an account', () => {
  let page: Page;
  let password: string;
  const body = `Nappy changes go better with a song ${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    const signed = await signUp(page, { name: 'Sharer' });
    password = signed.password;
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('an author picks a nickname and posts', async () => {
    await gotoCaregiver(page, '/settings/community/', password);
    await page.getByLabel('Community name', { exact: true }).fill(`sharer${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Save community name', exact: true }).click();
    await expect(page.getByText('Your community name')).toBeVisible();

    // A direct visit, no caregiver unlock: /community/ is public now, so even a
    // signed-in author lands on it straight away instead of being sent to the child view.
    await page.goto('/community/');
    await expect(page).toHaveURL(/\/community\//);
    await page.getByRole('link', { name: /New post/ }).click();
    await page.waitForURL('**/community/new/');
    await page.getByLabel('What do you want to share?', { exact: true }).fill(body);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await page.waitForURL('**/community/post/**');
    await expect(page.getByText(body)).toBeVisible();
  });

  test('a signed-out visitor reads the feed and is offered a way in', async ({ browser }) => {
    // Its own context: no tokens, no Dexie, nothing from the author's session.
    const anon = await browser.newPage();
    try {
      await anon.goto('/community/');
      // The sign-in wall would have redirected away from /community/ entirely.
      await expect(anon).toHaveURL(/\/community\//);
      await expect(anon.getByText(body)).toBeVisible();

      // Writing needs an account, so the controls are replaced by a way in
      // rather than buttons that would 401.
      await expect(anon.getByRole('link', { name: 'Sign in to share' })).toBeVisible();
      await expect(anon.getByRole('link', { name: /New post/ })).toHaveCount(0);

      await expectNoOverflow(anon, 'community feed, signed out');
      await snap(anon, 'community-public-feed');
    } finally {
      await anon.close();
    }
  });

  test('a signed-out visitor opens a post and sees no comment box', async ({ browser }) => {
    const anon = await browser.newPage();
    try {
      await anon.goto('/community/');
      await anon.getByText(body).click();
      await anon.waitForURL('**/community/post/**');
      await expect(anon.getByText(body)).toBeVisible();

      // The link itself is "Sign in"; the phrase around it says what for.
      await expect(anon.getByText('Sign in to comment')).toBeVisible();
      await expect(anon.getByLabel('Add a comment', { exact: true })).toHaveCount(0);
      // Nothing may be edited or removed by someone with no account.
      await expect(anon.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(anon.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);

      await expectNoOverflow(anon, 'community post, signed out');
    } finally {
      await anon.close();
    }
  });
});
