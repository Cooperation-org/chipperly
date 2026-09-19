import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap, tapTarget } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

test.describe('child mode', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Child Tester' });

    // The starter plan already seeds Wake Up (and 11 other recurring
    // activities) on a fresh profile's Today, materialized async on mount;
    // wait for it so the floating "Add activity" button (still ambiguous
    // with the empty state's button of the same name until then) is the
    // only match. Then add one more activity, with a step, so a routine row
    // exists too.
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Get Dressed With Steps');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Put on shirt');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S23 lock this device with a PIN', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S23 lock this device (set PIN)');
    await snap(page, 's23-lock-set-pin');

    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');

    await expect(sheet.getByRole('switch', { name: 'Show free-time choices' })).toHaveAttribute('aria-checked', 'true');
    // Off by default now that the Chipper Chart meter replaces it
    // (lib/device/settings.ts); this test still wants the attitude prompt
    // for the row below, so it opts back in here.
    const attitudeToggle = sheet.getByRole('switch', { name: 'Ask how it went after each task' });
    await expect(attitudeToggle).toHaveAttribute('aria-checked', 'false');
    await attitudeToggle.click();
    await expect(attitudeToggle).toHaveAttribute('aria-checked', 'true');
    await expectNoOverflow(page, 'S23 lock this device (toggles)');
    await snap(page, 's23-lock-toggles');

    await sheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');
  });

  test('S32 child today: header, no tab bar, no settings gear', async () => {
    await expect(page.getByRole('heading', { name: 'Benny' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'S32 child today');
    await snap(page, 's32-child-today');
  });

  test('child rows and check circles meet the minimum tap size', async () => {
    // CheckCircle is a fixed 64px in child mode at every breakpoint
    // (components/ui/CheckCircle.module.css); the row itself grows on
    // tablets (components/child/ChildToday.module.css, >=768px: 96px rows,
    // ux-plan.md section 12).
    const checkbox = page.getByRole('checkbox', { name: /^Wake Up,/ });
    await tapTarget(checkbox);
    const box = await checkbox.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(60);

    const viewport = page.viewportSize();
    const isTabletOrWider = (viewport?.width ?? 0) >= 768;
    const row = page.locator('div[class*="ChildToday_row"]').first();
    const rowBox = await row.boundingBox();
    expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(isTabletOrWider ? 90 : 64);
  });

  test('check off a row: chip strip updates, attitude prompt, tap Good', async () => {
    // The strip shows from the start so the child can tap it to choose what
    // they're working for (ux-plan.md S32); it reads 0 chips until a
    // chip-earning row is checked off.
    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveAttribute('aria-label', /^0 of \d+ chips/);

    await page.getByRole('checkbox', { name: /^Wake Up,/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveAttribute('aria-checked', 'true');

    await expect(chipStrip).toHaveAttribute('aria-label', /^1 of \d+ chips/);

    const good = page.getByRole('button', { name: 'Good', exact: true });
    await expect(good).toBeVisible();
    await expectNoOverflow(page, 'S32 child today with attitude prompt');
    await snap(page, 's32-child-attitude-prompt');
    await good.click();
  });

  test('free time button opens the choices sheet', async () => {
    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('S24 lock glyph -> PIN pad -> wrong then correct PIN', async () => {
    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Unlock' });
    await expect(overlay).toBeVisible();
    await expectNoOverflow(page, 'S24 pin pad');
    await snap(page, 's24-pin-pad');

    await enterPin(page, '9999');
    await expect(overlay.getByRole('alert')).toContainText('Wrong PIN');

    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
    await expectNoOverflow(page, 'back at today after unlock');
  });

  test('SOW Q3 decided: lock with "Let Benny switch location" on, child taps location, chip strip follows', async () => {
    // Give School a balance that's visibly different from Home's before
    // locking, and leave School as the active location (the child's header
    // opens onto whichever location the device last had active).
    await gotoTab(page, 'chips');
    await page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio', { name: 'School' }).click();
    const board = page.getByRole('img', { name: /of 5 chips/ });
    await page.getByRole('button', { name: /Add chip/ }).click();
    await page.getByRole('button', { name: /Add chip/ }).click();
    await expect(board).toHaveAttribute('aria-label', '2 of 5 chips');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(sheet).toBeVisible();

    const locationToggle = sheet.getByRole('switch', { name: 'Let Benny switch location' });
    await expect(locationToggle).toHaveAttribute('aria-checked', 'false');
    await locationToggle.click();
    await expect(locationToggle).toHaveAttribute('aria-checked', 'true');

    await sheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');

    const locationButton = page.getByRole('button', { name: 'School', exact: true });
    await expect(locationButton).toBeVisible();
    await tapTarget(locationButton);
    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveAttribute('aria-label', /^2 of 5 chips/);

    await locationButton.click();
    const picker = page.getByRole('dialog', { name: 'Choose location' });
    await expect(picker).toBeVisible();
    await expectNoOverflow(page, 'S32 child location picker');
    await snap(page, 's32-child-location-picker');

    await picker.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(picker).toBeHidden();

    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    // Home earned its one chip back in "check off a row: chip strip updates...".
    await expect(chipStrip).toHaveAttribute('aria-label', /^1 of 5 chips/);

    // Leave the suite unlocked.
    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
  });
});
