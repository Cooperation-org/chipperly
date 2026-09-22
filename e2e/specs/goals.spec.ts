import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, reloadCaregiver, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

/**
 * A goal and a reward per routine and per day, and the Chips tab's three
 * views (owner's feedback doc, My Day 9: "set a goal and a reward for each
 * part of the schedule, and ... view by the day or by the routine").
 */
test.describe('goals per routine and per day', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Goals Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('set a goal and a reward on a starter routine', async () => {
    // The starter plan seeds Today, so "Wake Up" is there to carry the goal.
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Wake Up' }).click();
    const itemSheet = page.getByRole('dialog');
    await itemSheet.getByRole('button', { name: 'Edit activity', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');

    await page.getByRole('button', { name: /^Goal/ }).click();
    await page.getByLabel('Goal (optional)', { exact: true }).fill('Get to camp on time');
    await page.getByRole('button', { name: 'Choose a reward', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Reward for this goal' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: /^Ice cream/ }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test('Chips > Routine shows the goal and its reward', async () => {
    await gotoTab(page, 'chips');
    await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Routine' }).click();

    await expect(page.getByText('Get to camp on time')).toBeVisible();
    await expect(page.getByText('Ice cream')).toBeVisible();
    await expectNoOverflow(page, 'S10 chips by routine');
    await snap(page, 's10-chips-routine');
  });

  test('Chips > Day: set the day goal, it survives a reload', async () => {
    await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Day' }).click();
    await expect(page.getByText('Set a goal for the day')).toBeVisible();

    await page.getByRole('button', { name: 'Edit day goal', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Day goal' });
    await sheet.getByLabel('Goal for the day', { exact: true }).fill('Stay on task');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Stay on task')).toBeVisible();

    // The view itself is remembered per profile in kv, so a reload lands back on Day.
    await reloadCaregiver(page, password);
    await expect(page.getByText('Stay on task')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Day' })).toBeChecked();
    await expectNoOverflow(page, 'S10 chips by day');
    await snap(page, 's10-chips-day');
  });

  test('back to Place: the board is unchanged', async () => {
    await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Place' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('img', { name: /of \d+ chips/ })).toBeVisible();
  });
});
