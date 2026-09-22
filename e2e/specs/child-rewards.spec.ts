import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap, tapTarget, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

// Feature D (owner's doc EI 2 + EI 6): the child picks what they're working
// for and, in free time, redeems an earned reward they can afford — both
// switchable off by the caregiver in Settings > profile.
test.describe('child picks and redeems a reward', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Reward Tester' });

    // Every seeded reward (Ice cream included) costs 5 chips and the
    // seeded Home location's goal is 5 too, so one tap on the last chip
    // (star-rating style) fills the board without touching any activity
    // check-off (chips.spec.ts).
    await gotoTab(page, 'chips');
    const board = page.getByRole('status', { name: /of 5 chips/ });
    await page.getByRole('button', { name: 'Set chips to 5 of 5', exact: true }).click();
    await expect(board).toHaveAttribute('aria-label', '5 of 5 chips');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('lock into the child view (child.spec.ts)', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lock this device' });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');
  });

  test('tap the working-for area, pick a reward, see it in the strip', async () => {
    // No reward chosen yet, but the five manual chips already fill the
    // board, so the strip is up (S32: ChipStrip with the reward, or the
    // empty state) and tappable because child_picks_reward defaults on.
    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveAttribute('aria-label', '5 of 5 chips');
    await tapTarget(chipStrip);
    await chipStrip.click();

    const sheet = page.getByRole('dialog', { name: 'Working for' });
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 's32 child pick reward');
    await snap(page, 's32-child-pick-reward');

    const rewardButton = sheet.getByRole('button', { name: /^Ice cream/ });
    await expect(rewardButton).toHaveAttribute('aria-pressed', 'false');
    await rewardButton.click();
    await expect(sheet).toBeHidden();

    await expect(chipStrip).toHaveAttribute('aria-label', /working for Ice cream/);
  });

  test('with child_picks_reward off, the child can still tap the board directly', async () => {
    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    const pickToggle = page.getByRole('switch', { name: 'Child can choose the reward' });
    await expect(pickToggle).toHaveAttribute('aria-checked', 'true');
    await pickToggle.click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const lockSheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(lockSheet).toBeVisible();
    await lockSheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');

    // With child_picks_reward off, tapping the strip opens the "Chips"
    // sheet (ChildToday's openWorkingFor) instead of the reward picker --
    // its board is tappable too (lib/data/chips.ts's shared setFilled),
    // the same star-rating interaction as the caregiver Chips tab.
    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveAttribute('aria-label', /^5 of 5 chips/);
    await chipStrip.click();
    const sheet = page.getByRole('dialog', { name: 'Chips' });
    await expect(sheet).toBeVisible();
    // Sheet.tsx's open() freezes whatever ReactNode it's given as a static
    // snapshot -- WorkingForSheet is its own component with its own live
    // hooks specifically so taps inside it keep updating (the sheet's own
    // board, not just the header strip outside it) rather than staying
    // stuck showing the fill level from the moment it opened.
    const sheetStatus = sheet.getByRole('status', { name: /of \d+ chips/ });
    await sheet.getByRole('button', { name: 'Set chips to 3 of 5', exact: true }).click();
    await expect(sheetStatus).toHaveAttribute('aria-label', '3 of 5 chips');
    await expect(chipStrip).toHaveAttribute('aria-label', /^3 of 5 chips/);

    // Restore the balance and both settings for the tests that follow,
    // which expect 5 of 5 chips, child_picks_reward on, and unlocked.
    await sheet.getByRole('button', { name: 'Set chips to 5 of 5', exact: true }).click();
    await expect(sheetStatus).toHaveAttribute('aria-label', '5 of 5 chips');
    await expect(chipStrip).toHaveAttribute('aria-label', /^5 of 5 chips/);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    await page.getByRole('switch', { name: 'Child can choose the reward' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const lockSheetAgain = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(lockSheetAgain).toBeVisible();
    await lockSheetAgain.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');
  });

  test('Free time: earned reward shows Redeem, redeeming drops the balance', async () => {
    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();

    // Every default reward costs 5 chips and none is location-scoped, so
    // all 18 show up here as affordable at once; scope to Ice cream's own
    // row rather than the ambiguous bare "Redeem" button.
    const iceCreamRow = sheet.locator('li', { hasText: 'Ice cream' });
    const redeemButton = iceCreamRow.getByRole('button', { name: 'Redeem', exact: true });
    await expect(redeemButton).toBeVisible();
    await expectNoOverflow(page, 's11 free time earned');
    await snap(page, 's11-free-time-earned');

    await redeemButton.click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText('Redeem Ice cream for 5 chips?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Redeem', exact: true }).click();

    await expect(toast(page)).toContainText('Redeemed Ice cream');
    // The balance is shared per location, not per reward, so redeeming
    // drops every reward's affordability together: no "Redeem" is left
    // anywhere in the sheet, not just on Ice cream's row.
    await expect(sheet.getByRole('button', { name: 'Redeem', exact: true })).toHaveCount(0);
    await expect(iceCreamRow.getByText('5 more chips')).toBeVisible();

    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveAttribute('aria-label', '0 of 5 chips');
  });

  test('caregiver turns both switches off; locked again, the strip is not a button and Redeem is absent', async () => {
    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');

    const pickToggle = page.getByRole('switch', { name: 'Child can choose the reward' });
    const redeemToggle = page.getByRole('switch', { name: 'Child can redeem rewards' });
    await expect(pickToggle).toHaveAttribute('aria-checked', 'true');
    await expect(redeemToggle).toHaveAttribute('aria-checked', 'true');
    await pickToggle.click();
    await redeemToggle.click();
    await expect(pickToggle).toHaveAttribute('aria-checked', 'false');
    await expect(redeemToggle).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const lockSheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(lockSheet).toBeVisible();
    await lockSheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');

    // Balance and working-for both settled at zero/none in the previous
    // test, so with child_picks_reward off there is nothing left for the
    // empty-state branch to make tappable: the strip must not render as a button.
    await expectNoOverflow(page, 's32 child today, both switches off');
    await expect(page.getByRole('button', { name: /of \d+ chips/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Redeem', exact: true })).toHaveCount(0);
  });
});
