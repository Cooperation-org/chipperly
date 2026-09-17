import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('chips and first-then', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Chips Tester' });
    await gotoTab(page, 'chips');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S10 renders with Home/School locations', async () => {
    const locationGroup = page.getByRole('radiogroup', { name: 'Location' });
    await expect(locationGroup.getByRole('radio', { name: 'Home' })).toBeVisible();
    await expect(locationGroup.getByRole('radio', { name: 'School' })).toBeVisible();
    await expectNoOverflow(page, 'S10 chips');
    await snap(page, 's10-chips');
  });

  test('+ adds a chip, - removes it', async () => {
    const board = page.getByRole('img', { name: /of 5 chips/ });
    await expect(board).toHaveAttribute('aria-label', '0 of 5 chips');

    await page.getByRole('button', { name: /Add chip/ }).click();
    await expect(board).toHaveAttribute('aria-label', '1 of 5 chips');

    await page.getByRole('button', { name: /Remove chip/ }).click();
    await expect(board).toHaveAttribute('aria-label', '0 of 5 chips');
  });

  test('choose a working-for reward, fill the board, redeem', async () => {
    await page.getByRole('button', { name: /Working for/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^Ice cream/ }).click();

    const board = page.getByRole('img', { name: /of \d+ chips/ });
    await expect(page.getByRole('button', { name: /^Working for/ })).toContainText('Ice cream');

    // Fill the board to its goal (5 by default), waiting for each chip to
    // actually land (the balance comes from an async Dexie write) before
    // tapping again, rather than reading aria-label synchronously right
    // after a click and risking a stale read.
    const initialLabel = (await board.getAttribute('aria-label')) ?? '';
    const total = Number(/of (\d+) chips/.exec(initialLabel)?.[1] ?? 0);
    expect(total).toBeGreaterThan(0);
    for (let filled = 1; filled <= total; filled += 1) {
      await page.getByRole('button', { name: /Add chip/ }).click();
      await expect(board).toHaveAttribute('aria-label', `${filled} of ${total} chips`);
    }

    const redeemButton = page.getByRole('button', { name: /^Redeem/ });
    await expect(redeemButton).toBeVisible();
    await expectNoOverflow(page, 'S10 chips full board');
    await snap(page, 's10-chips-full');

    await redeemButton.click();
    await expect(toast(page)).toContainText('Redeemed Ice cream');
  });

  test('S12 chip history lists entries', async () => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.waitForURL('**/chips/history/');
    await expect(page.getByRole('heading', { name: 'Chip history', level: 1 })).toBeVisible();
    await expectNoOverflow(page, 'S12 chip history');
    await snap(page, 's12-chip-history');
    await page.goBack();
    await page.waitForURL('**/chips/');
  });

  test('S11 free-time choices sheet opens', async () => {
    await page.getByRole('button', { name: 'Free time choices', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S11 free time');
    await snap(page, 's11-free-time');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('S15 First-Then: pick, Done, clear both', async () => {
    await gotoTab(page, 'first-then');
    await expectNoOverflow(page, 'S15 first-then empty');
    await snap(page, 's15-first-then-empty');

    await page.getByRole('button', { name: 'Choose an activity', exact: true }).click();
    let sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Wake Up', exact: true }).click();

    await page.getByRole('button', { name: 'Choose a reward', exact: true }).click();
    sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^Ice cream/ }).click();

    const done = page.getByRole('checkbox', { name: /^Done,/ });
    await expect(done).toBeVisible();
    await done.click();
    await expect(done).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[class*="FirstThenPanels_enlarged"]')).toBeVisible();
    await expectNoOverflow(page, 'S15 first-then done');
    await snap(page, 's15-first-then-done');

    await page.getByRole('button', { name: 'More', exact: true }).click();
    sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Clear both', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose an activity', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a reward', exact: true })).toBeVisible();
  });
});
