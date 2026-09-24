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

  test('tap a chip directly to set the board (star-rating style)', async () => {
    const board = page.getByRole('status', { name: /of 5 chips/ });

    // Tapping an unfilled chip fills up through it.
    await page.getByRole('button', { name: 'Set chips to 3 of 5', exact: true }).click();
    await expect(board).toHaveAttribute('aria-label', '3 of 5 chips');

    // Tapping a filled chip empties back down through it, leaving the board
    // where the next test expects to find it.
    await page.getByRole('button', { name: 'Set chips to 0 of 5', exact: true }).click();
    await expect(board).toHaveAttribute('aria-label', '0 of 5 chips');
  });

  test('choose a working-for reward, fill the board, redeem', async () => {
    await page.getByRole('button', { name: /Working for/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^Ice cream/ }).click();

    const board = page.getByRole('status', { name: /of \d+ chips/ });
    await expect(page.getByRole('button', { name: /^Working for/ })).toContainText('Ice cream');

    // The chosen reward is editable right here, not only from Settings > Library > Rewards.
    await page.getByRole('button', { name: 'Edit Ice cream', exact: true }).click();
    await page.waitForURL('**/reward/edit/?id=**');
    await expect(page.getByRole('heading', { name: 'Edit reward' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Name/ })).toContainText('Ice cream');
    await page.goBack();
    await page.waitForURL('**/chips/');
    await expect(board).toBeVisible();

    // One tap on the last chip fills the whole board (star-rating style: tap
    // an unfilled chip and everything up through it fills in).
    // Poll: right after returning from the reward page the board can briefly render before its goal loads.
    const totalOf = async () => Number(/of (\d+) chips/.exec((await board.getAttribute('aria-label')) ?? '')?.[1] ?? 0);
    await expect.poll(totalOf).toBeGreaterThan(0);
    const total = await totalOf();
    await page.getByRole('button', { name: `Set chips to ${total} of ${total}`, exact: true }).click();
    await expect(board).toHaveAttribute('aria-label', `${total} of ${total} chips`);

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

    // Done used to live in component state and was lost every time the view closed.
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^Done,/ })).toHaveAttribute('aria-checked', 'true');

    // Optional reward timer, off by default.
    await page.getByRole('button', { name: 'More', exact: true }).click();
    sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '15 min', exact: true }).click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: '15 min', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: 'Clear both', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose an activity', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a reward', exact: true })).toBeVisible();
  });

  test('SOW Q1 decided: "Start over" redeem mode empties the whole balance, not just the cost', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');

    const redeemMode = page.getByRole('radiogroup', { name: 'After a reward' });
    await redeemMode.getByRole('radio', { name: 'Start over', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    // Every seeded reward costs 5 chips; bank more than that before picking
    // one so "start over" (whole balance) and "subtract the cost" (only 5)
    // would land on visibly different balances. The chip board's tap
    // targets cap at the location's goal (same as the + button they
    // replaced), so there's no UI affordance for banking past it directly
    // -- bank the extra the way a real caregiver would instead: check off
    // seven starter tasks (each worth 1 chip) rather than five.
    await gotoTab(page, 'today');
    for (const name of ['Wake Up', 'Breakfast', 'Get Dressed', 'Brush Teeth', 'Lunch', 'Dinner', 'Bath Time']) {
      await page.getByRole('checkbox', { name: new RegExp(`^${name},`) }).click();
    }
    await gotoTab(page, 'chips');

    const board = page.getByRole('status', { name: /of 5 chips/ });
    await expect(board).toHaveAttribute('aria-label', '5 of 5 chips');

    await page.getByRole('button', { name: /^Working for/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /^Toy/ }).click();

    const redeemButton = page.getByRole('button', { name: /^Redeem/ });
    await expect(redeemButton).toBeVisible();
    await redeemButton.click();
    await expect(toast(page)).toContainText('Redeemed Toy');

    // Reward cleared on redeem, so the board goes back to the location's
    // goal (5); a subtract-mode redeem here would have left a balance
    // behind instead of zero, since the bank held more than the cost.
    await expect(page.getByRole('status', { name: /of 5 chips/ })).toHaveAttribute('aria-label', '0 of 5 chips');
  });
});
