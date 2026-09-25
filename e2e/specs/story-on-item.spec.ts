import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap, tapTarget } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/**
 * Owner's ask: "if I add a dentist appointment to the schedule, maybe there
 * could be a social story that Benny could click on." Attaches a story to a
 * Today item from the caregiver item sheet, then reads it from the child view.
 */
test.describe('story attached to a schedule item', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Story Item Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('create a story from a template (S16)', async () => {
    await gotoTab(page, 'stories');
    await page.getByRole('button', { name: 'Haircut', exact: true }).click();
    await page.waitForURL('**/story/edit/**');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/stories/');
    await expect(page.getByRole('button', { name: 'Getting a Haircut', exact: true })).toBeVisible();
  });

  test('S7 item sheet: attach the story to Wake Up', async () => {
    await gotoTab(page, 'today');
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Wake Up' }).click();
    const itemSheet = page.getByRole('dialog');
    await expect(itemSheet).toBeVisible();

    await itemSheet.getByRole('button', { name: 'Attach a story', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Story' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Getting a Haircut', exact: true }).click();

    // The picker's pick returns to the item sheet (useSheet().back()), not a fresh open.
    await expect(picker).toBeHidden();
    await expect(itemSheet).toBeVisible();
    await expect(itemSheet.getByRole('button', { name: 'Story: Getting a Haircut', exact: true })).toBeVisible();
    await expectNoOverflow(page, 'S7 item sheet with story');
    await snap(page, 's7-item-sheet-story');

    await itemSheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(itemSheet).toBeHidden();
  });

  test('the Today row shows a book mark for "Has a story"', async () => {
    const wakeUpRow = page.locator('button[class*="ListRow_main"]', { hasText: 'Wake Up' });
    await expect(wakeUpRow.getByRole('img', { name: 'Has a story' })).toBeVisible();
  });

  test('lock into the child view (S23/S24)', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    await expect(sheet).toBeVisible();
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  });

  test('S32 child today: tap Read story, see the first page, close, back on Today', async () => {
    await expect(page.getByRole('heading', { name: 'Benny' })).toBeVisible();

    const readStoryButton = page.getByRole('button', { name: 'Read story', exact: true });
    await expect(readStoryButton).toBeVisible();
    await tapTarget(readStoryButton);
    await readStoryButton.click();

    const viewer = page.getByRole('dialog', { name: 'Getting a Haircut' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText('Today I am getting a haircut.')).toBeVisible();
    await expectNoOverflow(page, 'S32 child read story');
    await snap(page, 's32-child-read-story');

    await viewer.getByRole('button', { name: 'Close story', exact: true }).click();
    await expect(viewer).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Benny' })).toBeVisible();

    // Leave the suite unlocked.
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
  });
});
