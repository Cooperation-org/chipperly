import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('templates', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // signUp skips the setup interview, so the profile has the fixed default lists.
    ({ password } = await signUp(page, { name: 'Templates Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Add > Start from a template > Speech therapy session > Add lands on the edit screen with 5 steps', async () => {
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start from a template', exact: true }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Therapy', level: 3 })).toBeVisible();
    await expectNoOverflow(page, 'template list');

    await sheet.getByRole('button', { name: /Speech therapy session/ }).click();
    await expect(sheet.getByRole('list', { name: 'Steps' }).getByRole('listitem')).toHaveCount(5);
    await sheet.getByRole('button', { name: 'Add to Benny', exact: true }).click();

    await page.waitForURL('**/activity/edit/?id=*');
    await expect(page.getByText('Added. Change anything you like.')).toBeVisible();
    // Every row is collapsed on edit: the Name row shows the name as its summary.
    await expect(page.getByRole('button', { name: /^Name/ })).toContainText('Speech therapy session');

    // The Steps row is collapsed on edit; open it and check the rows.
    await page.getByRole('button', { name: /^Steps/ }).click();
    for (let i = 1; i <= 5; i += 1) await expect(page.getByLabel(`Step ${i}`, { exact: true })).not.toHaveValue('');
    await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue('Warm Up');
    await expect(page.getByLabel('Step 6', { exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'edit screen after template');
  });

  test('Save, then the routine is in the routines library', async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // It has steps, so it is listed under routines. A full navigation resets caregiver mode, hence the unlock helper.
    await gotoCaregiver(page, '/settings/library/routines/', password);
    await expect(page.getByRole('button', { name: /Speech therapy session/ }).first()).toBeVisible();
  });
});
