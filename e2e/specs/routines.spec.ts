import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('routines', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Routines Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S8 picker: Activities and Routines sections, zero routines seeded', async () => {
    // The starter plan materializes async on mount; wait for it so the
    // floating "Add activity" button is the only match (not still
    // ambiguous with the empty state's button of the same name).
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole('heading', { name: 'Activities', level: 3 })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Routines', level: 3 })).toBeVisible();

    const routinesSection = sheet.locator('section', { has: page.getByRole('heading', { name: 'Routines', level: 3 }) });
    await expect(routinesSection.getByRole('button', { name: 'New routine', exact: true })).toBeVisible();
    // Seeded activities have no steps yet, so the only tile in Routines is the dashed "New routine" one.
    await expect(routinesSection.getByRole('button')).toHaveCount(1);

    await expectNoOverflow(page, 'S8 picker with routines section');
    await snap(page, 's8-picker-routines');
  });

  test('New routine -> steps (one From activity) -> Save -> shows on Today', async () => {
    const sheet = page.getByRole('dialog');
    const routinesSection = sheet.locator('section', { has: page.getByRole('heading', { name: 'Routines', level: 3 }) });
    await routinesSection.getByRole('button', { name: 'New routine', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    expect(page.url()).toContain('routine=1');

    await expect(page.getByRole('heading', { name: 'New routine' })).toBeVisible();
    await expectNoOverflow(page, 'S9 new routine');
    await snap(page, 's9-new-routine');

    // Steps starts expanded with one empty, focused row — no need to open the "Steps" row first.
    await expect(page.getByLabel('Step 1', { exact: true })).toBeFocused();
    await page.getByLabel('Step 1', { exact: true }).fill('Wash hands');

    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByRole('button', { name: 'Change picture', exact: true }).nth(1).click();

    const fromActivitySheet = page.getByRole('dialog', { name: 'Choose an activity' });
    await expect(fromActivitySheet).toBeVisible();
    // This nested picker offers plain activities only, no routine section.
    await expect(fromActivitySheet.getByRole('heading', { name: 'Routines', level: 3 })).toHaveCount(0);
    // Not a starter-plan activity (e.g. "Brush Teeth"): the picker's own
    // "Recent" section also lists anything materialized onto today, so a
    // starter item's tile would resolve twice here.
    await fromActivitySheet.getByRole('button', { name: 'Snack Time', exact: true }).click();
    await expect(fromActivitySheet).toBeHidden();
    await expect(page.getByLabel('Step 2', { exact: true })).toHaveValue('Snack Time');

    // Name was left collapsed by default in routine mode; open it to fill it in.
    await page.getByRole('button', { name: /^Name/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Morning Routine');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');

    await expect(page.getByRole('checkbox', { name: /^Morning Routine,/ })).toBeVisible();
    await expect(page.getByText('Routine · 2 steps')).toBeVisible();
    await expectNoOverflow(page, 'S6 today with routine');
    await snap(page, 's6-today-routine');

    await page.getByRole('button', { name: 'Expand Morning Routine steps', exact: true }).click();
    await expect(page.getByText('Wash hands')).toBeVisible();
    await expect(page.getByText('Snack Time')).toBeVisible();
  });

  test('Settings > Library > Routines lists it, Activities does not', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Routines', exact: true }).click();
    await page.waitForURL('**/settings/library/routines/');
    await expect(page.getByRole('heading', { name: 'Routines' })).toBeVisible();

    const row = page.locator('button[class*="ListRow_main"]', { hasText: 'Morning Routine' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('2 steps');
    await expectNoOverflow(page, 'S25 library routines');
    await snap(page, 's25-library-routines');

    await gotoCaregiver(page, '/settings/library/activities/', password);
    await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Morning Routine' })).toHaveCount(0);
  });

  test('set an activity to weekly on two days in the editor and see the label', async () => {
    await gotoCaregiver(page, '/settings/library/activities/', password);
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Brush Teeth' }).click();
    await page.waitForURL('**/activity/edit/**');

    await page.getByRole('button', { name: /^Repeat/ }).click();
    // Not getByLabel: Playwright's label-text match folds in the <select>'s
    // own rendered option text (e.g. "RepeatNone"), so an exact 'Repeat'
    // match never resolves. getByRole reads the accessible name off the
    // accessibility tree instead, which correctly excludes it.
    await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('weekly');
    await page.getByRole('button', { name: 'Tuesday', exact: true }).click();
    await page.getByRole('button', { name: 'Thursday', exact: true }).click();
    await expectNoOverflow(page, 'S9 weekly on two days');
    await snap(page, 's9-weekly-two-days');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/library/activities/**');
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Brush Teeth' })).toContainText('Weekly on Tue, Thu');
  });

  test('add a 5-minute step then start its timer from the item sheet', async () => {
    await gotoCaregiver(page, '/settings/library/routines/', password);
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Morning Routine' }).click();
    await page.waitForURL('**/activity/edit/**');

    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel('Step 3', { exact: true }).fill('Get dressed');
    await page.getByLabel('Minutes for step 3', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/library/routines/**');

    await gotoCaregiver(page, '/today/', password);
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Morning Routine' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('5 min')).toBeVisible();
    await expectNoOverflow(page, 'S7 item sheet with timed step');
    await snap(page, 's7-item-sheet-timed-step');

    await sheet.getByRole('button', { name: 'Start 5 minute timer for Get dressed', exact: true }).click();
    await page.waitForURL('**/timer/');
    await expect(page.getByText('5:00')).toBeVisible();
  });
});
