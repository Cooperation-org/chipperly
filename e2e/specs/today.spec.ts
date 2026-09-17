import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('today', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Today Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S6 empty state', async () => {
    const emptyState = page.locator('div[class*="EmptyState_wrap"]');
    await expect(page.getByText(/^Nothing planned for/)).toBeVisible();
    await expect(emptyState.getByRole('button', { name: 'Add activity', exact: true })).toBeVisible();
    await expect(emptyState.getByRole('button', { name: 'Copy yesterday', exact: true })).toBeVisible();
    await expect(emptyState.getByRole('button', { name: /Use weekday plan|Use weekend plan/ })).toBeVisible();
    await expectNoOverflow(page, 'S6 today empty');
    await snap(page, 's6-today-empty');
  });

  test('add an activity via the picker and check it off, with undo', async () => {
    // Both the empty state's "Add activity" Button and the floating +
    // IconButton share the accessible name "Add activity" here; the empty
    // state is still showing, so scope to it.
    await page.locator('div[class*="EmptyState_wrap"]').getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S8 picker');
    await snap(page, 's8-picker');

    await sheet.getByRole('button', { name: 'Wake Up', exact: true }).click();
    await expect(toast(page)).toContainText('Added Wake Up');

    const checkbox = page.getByRole('checkbox', { name: /^Wake Up,/ });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(toast(page)).toContainText('Done: Wake Up');
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await expectNoOverflow(page, 'S6 today one item');
    await snap(page, 's6-today-one-item');
  });

  test('add a second activity via + and picker search', async () => {
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    const search = sheet.getByLabel('Search', { exact: true });
    await expect(search).toBeVisible();
    await search.fill('Breakfast');
    await sheet.getByRole('button', { name: 'Breakfast', exact: true }).click();
    await expect(toast(page)).toContainText('Added Breakfast');
    await expect(page.getByRole('checkbox', { name: /^Breakfast,/ })).toBeVisible();
  });

  test('S7 item sheet: set part of day', async () => {
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Breakfast' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S7 item sheet');
    await snap(page, 's7-item-sheet');

    await sheet.getByRole('radiogroup', { name: 'Part of day' }).getByRole('radio', { name: 'Morning' }).click();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByRole('heading', { name: 'MORNING', level: 3 })).toBeVisible();
  });

  test('date nav: prev / next / Today', async () => {
    const todayLabel = await page.locator('button[class*="DateNav_label"]').textContent();
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    const prevLabel = await page.locator('button[class*="DateNav_label"]').textContent();
    expect(prevLabel).not.toBe(todayLabel);
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Today', exact: true }).click();
    const backToToday = await page.locator('button[class*="DateNav_label"]').textContent();
    expect(backToToday).toBe(todayLabel);

    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    const nextLabel = await page.locator('button[class*="DateNav_label"]').textContent();
    expect(nextLabel).not.toBe(todayLabel);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
  });

  test('S9 create a new activity and add it to today', async () => {
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');

    await expect(page.getByRole('heading', { name: 'New activity' })).toBeVisible();
    await expectNoOverflow(page, 'S9 edit activity');
    await snap(page, 's9-edit-activity');

    await page.getByLabel('Name', { exact: true }).fill('E2E Custom Activity');

    await page.getByRole('button', { name: /^Chips/ }).click();
    const chipsStepper = page.getByRole('group', { name: 'Chips earned' });
    await chipsStepper.getByRole('button', { name: 'Increase', exact: true }).click();
    await chipsStepper.getByRole('button', { name: 'Increase', exact: true }).click();
    await expect(chipsStepper.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '2');

    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Wash hands');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');

    await expect(page.getByRole('checkbox', { name: /^E2E Custom Activity,/ })).toBeVisible();
    await expectNoOverflow(page, 'S6 today with custom activity');
    await snap(page, 's6-today-custom-activity');
  });

  test('S19 edit reward form via Settings > Library > Rewards', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Rewards', exact: true }).click();
    await page.waitForURL('**/settings/library/rewards/');
    await expectNoOverflow(page, 'S25 library rewards');
    await snap(page, 's25-library-rewards');

    await page.locator('button[class*="ListRow_main"]', { hasText: 'Ice cream' }).click();
    await page.waitForURL('**/reward/edit/**');
    await expect(page.getByRole('heading', { name: 'Edit reward' })).toBeVisible();
    await expectNoOverflow(page, 'S19 edit reward');
    await snap(page, 's19-edit-reward');

    await page.getByRole('button', { name: /^Cost/ }).click();
    await expect(page.getByRole('group', { name: 'Chip cost' })).toBeVisible();

    await page.goBack();
    await page.waitForURL('**/settings/library/rewards/');
  });

  test('offline: check off an item locally, reload, still checked', async () => {
    await page.goto('/today/');
    // Give the service worker time to control this page before going offline.
    await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => undefined);

    const checkbox = page.getByRole('checkbox', { name: /^E2E Custom Activity,/ });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await page.context().setOffline(true);
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^E2E Custom Activity,/ })).toHaveAttribute('aria-checked', 'true');

    const syncMark = page.getByRole('button', { name: 'Offline', exact: true });
    await expect(syncMark).toBeVisible();

    await page.context().setOffline(false);
  });

  test('back online: the offline check-off syncs back', async () => {
    // The sync engine's own 'online' listener should pick this up, but
    // that's a background event/timer race; force it through the same
    // user-facing "Sync now" action the app offers. Opened from the sync
    // mark (not Settings), this sheet has a title too (components/shell/
    // CaregiverShell.tsx's onSyncTap).
    const syncButton = page.getByRole('button', { name: /^Synced|^Sync pending|^Offline$|^Sync error$/ });
    await syncButton.click();
    const sheet = page.getByRole('dialog', { name: 'Sync' });
    await sheet.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect.poll(() => sheet.getByText(/Up to date/).isVisible(), { timeout: 20_000 }).toBe(true);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible();
  });
});
