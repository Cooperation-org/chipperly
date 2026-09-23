import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiverPin, gotoTab, reloadCaregiverPin, setCaregiverPin, signUp, snap, toast, unlockPinIfBounced } from '../helpers';

test.describe.configure({ mode: 'serial' });

const PIN = '1470';

test.describe('today', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Today Tester' });
    // The offline reload test below needs to unlock without a network call
    // (UnlockOverlay's password path signs in over /auth/login); set while
    // still online so the PIN hash is cached before "offline: reload,
    // still checked" needs it.
    await setCaregiverPin(page, PIN);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // The 9 daily + 3 weekday-only starter activities (technical-plan.md
  // "starter day plan"), in the fixed order materializeRecurring gives them
  // (DEFAULT_ACTIVITIES order, filtered to the ones with a recurrence).
  const DAILY_STARTER_ITEMS = ['Wake Up', 'Breakfast', 'Get Dressed', 'Brush Teeth', 'Lunch', 'Dinner', 'Bath Time', 'Bedtime Story', 'Sleep'];
  const WEEKDAY_STARTER_ITEMS = ['Go to School', 'Go Home', 'Homework'];

  test('S6 starter plan on a fresh profile', async () => {
    // materializeRecurring seeds every profile with a starter day plan on
    // first open, so a fresh Today is never empty (docs/technical-plan.md
    // "starter day plan").
    const headers = page.locator('h3[class*="groupHeader"]');
    await expect(headers).toHaveText(['MORNING', 'AFTERNOON', 'EVENING']);

    const rows = page.locator('button[class*="ListRow_main"]');
    await expect(rows.first()).toContainText('Wake Up');

    for (const name of DAILY_STARTER_ITEMS) {
      await expect(page.getByRole('checkbox', { name: new RegExp(`^${name},`) })).toBeVisible();
    }

    const isWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;
    for (const name of WEEKDAY_STARTER_ITEMS) {
      const checkbox = page.getByRole('checkbox', { name: new RegExp(`^${name},`) });
      if (isWeekday) await expect(checkbox).toBeVisible();
      else await expect(checkbox).toHaveCount(0);
    }

    // Chip strip rule unchanged: no reward chosen and nothing checked off yet, so it stays hidden.
    await expect(page.getByRole('button', { name: /of \d+ chips/ })).toHaveCount(0);

    await expectNoOverflow(page, 'S6 today starter plan');
    await snap(page, 's6-today-starter-plan');
  });

  test('S6 reach the empty state honestly: remove every starter item', async () => {
    const isWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;
    const allStarterItems = isWeekday ? [...DAILY_STARTER_ITEMS, ...WEEKDAY_STARTER_ITEMS] : DAILY_STARTER_ITEMS;

    for (const name of allStarterItems) {
      await page.locator('button[class*="ListRow_main"]', { hasText: name }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: 'Remove from today', exact: true }).click();
      await sheet.getByRole('button', { name: 'Every day', exact: true }).click();
      await expect(sheet).toBeHidden();
    }

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

  test('offline: check off an item locally', async () => {
    await gotoCaregiverPin(page, '/today/', PIN);
    // Give the service worker time to control this page before going offline.
    await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => undefined);

    const checkbox = page.getByRole('checkbox', { name: /^E2E Custom Activity,/ });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await page.context().setOffline(true);
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  test('offline: reload, still checked', async ({ browserName }) => {
    // Same driver-level bug as offline-start.spec.ts's reload test:
    // page.reload() while the context is offline throws "WebKit encountered
    // an internal error" on this WebKit build, reproducing with no app or
    // service worker involved — test problem, not an app bug.
    test.skip(browserName === 'webkit', 'WebKit: reload() while offline throws "WebKit encountered an internal error" at the driver level (repros with no app involved) — test problem, not an app bug.');

    await reloadCaregiverPin(page, PIN);
    await expect(page.getByRole('checkbox', { name: /^E2E Custom Activity,/ })).toHaveAttribute('aria-checked', 'true');

    const syncMark = page.getByRole('button', { name: 'Offline', exact: true });
    await expect(syncMark).toBeVisible();
  });

  test('back online: the offline check-off syncs back', async () => {
    // Always bring the context back online here, whether or not the reload
    // test above ran (it's skipped on webkit).
    await page.context().setOffline(false);

    // The offline reload above can leave the page's original top-level
    // navigation request still held by the browser until connectivity
    // returns; it completes late, re-running session.ts's bootstrap (parent_
    // mode's full-navigation reset) and bouncing to /child/ a moment after
    // the page already looked fine. Give it a beat, then unlock again if so.
    await page.waitForTimeout(1500);
    await unlockPinIfBounced(page, '/today/', PIN);

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
  test('switch location from the top of Today, and Chips follows it', async () => {
    // At the top of Today, not only in Settings: a caregiver switches place right before handing over the device.
    const todayLocation = page.getByRole('radiogroup', { name: 'Location' });
    await todayLocation.getByRole('radio', { name: 'School' }).click();
    await expect(todayLocation.getByRole('radio', { name: 'School' })).toHaveAttribute('aria-checked', 'true');

    await gotoTab(page, 'chips');
    const chipsLocation = page.getByRole('radiogroup', { name: 'Location' });
    await expect(chipsLocation.getByRole('radio', { name: 'School' })).toHaveAttribute('aria-checked', 'true');
    await chipsLocation.getByRole('radio', { name: 'Home' }).click();
    await gotoTab(page, 'today');
    await expect(todayLocation.getByRole('radio', { name: 'Home' })).toHaveAttribute('aria-checked', 'true');
  });
});
