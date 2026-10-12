import { test, expect, type Page } from '@playwright/test';
import { gotoTab, signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

// The child's tiles home: the Stories tile opens a story to read, and the lock option that hides "Mark all done".
test.describe('child view: Stories tile and the Mark all done option', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Stories Tile Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('caregiver makes a story and a routine with a step, then locks to picture tiles', async () => {
    await gotoTab(page, 'stories');
    await page.getByRole('button', { name: 'Haircut', exact: true }).click();
    await page.waitForURL('**/story/edit/**');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/stories/');

    await gotoTab(page, 'today');
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Daily task or routine', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Get Ready');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Brush teeth');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /'s view$/ }).click();
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('radiogroup', { name: 'Home screen' }).getByRole('radio', { name: 'Picture tiles' }).click();
    await expect(sheet.getByRole('switch', { name: 'Show Mark all done on routines' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  });

  test('the Stories tile opens the story to read', async () => {
    await page.getByRole('button', { name: 'Stories', exact: true }).click();
    const shelf = page.getByRole('dialog', { name: 'Stories' });
    await shelf.getByRole('button', { name: 'Getting a Haircut', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Getting a Haircut' });
    await expect(viewer.getByRole('button', { name: 'Next page', exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Close story', exact: true }).click();
    await expect(viewer).toBeHidden();
    await shelf.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(shelf).toBeHidden();
  });

  test('My Day shows Mark all done while the option is on', async () => {
    await page.getByRole('button', { name: 'My Day', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /^Get Ready,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all done, Get Ready', exact: true })).toBeVisible();
  });

  test('with the option off, Mark all done is hidden', async () => {
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /'s view$/ }).click();
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await sheet.getByRole('switch', { name: 'Show Mark all done on routines' }).click();
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');

    await page.getByRole('button', { name: 'My Day', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /^Get Ready,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mark all done/ })).toHaveCount(0);

    // Leave the suite unlocked.
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
  });
});
