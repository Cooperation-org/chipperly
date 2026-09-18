import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('routines', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Routines Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S8 picker: Activities and Routines sections, zero routines seeded', async () => {
    await page.locator('div[class*="EmptyState_wrap"]').getByRole('button', { name: 'Add activity', exact: true }).click();
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

    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page.getByRole('button', { name: 'From activity', exact: true }).nth(1).click();

    const fromActivitySheet = page.getByRole('dialog', { name: 'Choose an activity' });
    await expect(fromActivitySheet).toBeVisible();
    // This nested picker offers plain activities only, no routine section.
    await expect(fromActivitySheet.getByRole('heading', { name: 'Routines', level: 3 })).toHaveCount(0);
    await fromActivitySheet.getByRole('button', { name: 'Brush Teeth', exact: true }).click();
    await expect(fromActivitySheet).toBeHidden();
    await expect(page.getByLabel('Step 2', { exact: true })).toHaveValue('Brush Teeth');

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
    await expect(page.getByText('Brush Teeth')).toBeVisible();
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

    await page.goto('/settings/library/activities/');
    await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Morning Routine' })).toHaveCount(0);
  });
});
