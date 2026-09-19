import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

test.describe('day bands', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Band Tester' });
    // Starter plan seeds Today (materializeRecurringFresh on mount, see
    // child.spec.ts); wait for it so the note affordance isn't racing an
    // empty list, and so Wake Up is there for the bottom band later.
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('caregiver: add a note for today and one for tomorrow', async () => {
    await page.getByRole('button', { name: 'Add a note for today', exact: true }).click();
    const todaySheet = page.getByRole('dialog', { name: 'Note for Benny' });
    await expect(todaySheet).toBeVisible();
    await todaySheet.getByLabel('Note for Benny', { exact: true }).fill('Grandma is visiting after school.');
    await todaySheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(todaySheet).toBeHidden();

    await expect(page.getByText('Grandma is visiting after school.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit note for Benny', exact: true })).toBeVisible();
    await expectNoOverflow(page, 'S6 today with a note');
    await snap(page, 's6-today-note');

    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await page.getByRole('button', { name: 'Add a note for today', exact: true }).click();
    const tomorrowSheet = page.getByRole('dialog', { name: 'Note for Benny' });
    await expect(tomorrowSheet).toBeVisible();
    await tomorrowSheet.getByLabel('Note for Benny', { exact: true }).fill('Swim class starts at 4.');
    await tomorrowSheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(tomorrowSheet).toBeHidden();
    await expect(page.getByText('Swim class starts at 4.')).toBeVisible();

    // Back to today for the lock flow below.
    await page.getByRole('button', { name: 'Today', exact: true }).click();
  });

  test('lock into the child view', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(sheet).toBeVisible();

    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');

    await sheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');
    await expect(page.getByRole('heading', { name: 'Benny' })).toBeVisible();
  });

  test('S32: today note at the top band, tomorrow note and Wake Up at the bottom band', async () => {
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today.getByText('Grandma is visiting after school.')).toBeVisible();

    const tomorrow = page.getByRole('region', { name: 'Tomorrow' });
    await expect(tomorrow.getByText('Swim class starts at 4.')).toBeVisible();
    await expect(tomorrow.getByText('Wake Up', { exact: true })).toBeVisible();

    await expectNoOverflow(page, 'S32 child today with day bands');
    await snap(page, 's32-child-bands');
  });
});
