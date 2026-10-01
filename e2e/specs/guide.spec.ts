import { test, expect, type Page } from '@playwright/test';
import { gotoCaregiver, reloadCaregiver, signUp, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('guide and first-visit hints', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Guide Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('the guide opens from Settings', async () => {
    await gotoCaregiver(page, '/settings/', password);
    await page.getByRole('button', { name: /How to use Chipperly/ }).click();
    await expect(page).toHaveURL(/\/settings\/guide\/$/);
    await expect(page.getByRole('heading', { name: 'How to use Chipperly' })).toBeVisible();
    await page.getByText('Social stories', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Write a story' })).toBeVisible();
  });

  test('a Today hint shows for a new account and stays dismissed after reload', async () => {
    await gotoCaregiver(page, '/today/', password);
    const hint = page.getByRole('complementary', { name: 'Tip' });
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Got it' }).click();
    await expect(hint).toHaveCount(0);
    await reloadCaregiver(page, password);
    await expect(page.getByRole('heading', { name: /Today/ }).or(page.locator('main')).first()).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Tip' })).toHaveCount(0);
  });

  test('Show tips again brings the hint back', async () => {
    await gotoCaregiver(page, '/settings/guide/', password);
    await page.getByRole('button', { name: 'Show tips again' }).click();
    // The toast comes after the IndexedDB delete; leaving before it lands can cancel the delete.
    await expect(toast(page)).toContainText('Tips will show again');
    await gotoCaregiver(page, '/today/', password);
    await expect(page.getByRole('complementary', { name: 'Tip' })).toBeVisible();
  });
});
