import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

test.describe('chipper chart', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Chart Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S35: open from Today, plus/minus and a bar tap move the level, and it persists across reload', async () => {
    await page.getByRole('button', { name: 'Chipper Chart', exact: true }).click();
    await page.waitForURL('**/chipper-chart/');
    await expect(page.getByRole('heading', { name: /Chipper Chart/ })).toBeVisible();
    await expectNoOverflow(page, 'S35 chipper chart empty');
    await snap(page, 's35-chipper-chart');

    const plus = page.getByRole('button', { name: 'Increase mood', exact: true });
    const minus = page.getByRole('button', { name: 'Decrease mood', exact: true });
    const bar = page.getByRole('slider', { name: 'Mood level' });

    await plus.click();
    await plus.click();
    await expect(bar).toHaveAttribute('aria-valuenow', '2');
    await expect(page.getByText('Today: +2', { exact: true })).toBeVisible();

    await minus.click();
    await expect(bar).toHaveAttribute('aria-valuenow', '1');

    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await bar.click({ position: { x: Math.round(box.width * 0.95), y: Math.round(box.height / 2) } });
    }
    // The click's level write goes through async Dexie mutate+live-query, so poll rather than
    // read the attribute once (an immediate getAttribute can catch the pre-write value).
    await expect(async () => {
      expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(3);
    }).toPass();
    const level = Number(await bar.getAttribute('aria-valuenow'));
    await expectNoOverflow(page, 'S35 chipper chart after taps');
    await snap(page, 's35-chipper-chart-after-taps');

    await page.reload();
    await expect(page.getByRole('slider', { name: 'Mood level' })).toHaveAttribute('aria-valuenow', String(level));
    await expect(page.getByRole('list').getByText('Today', { exact: true })).toBeVisible();
  });

  test('back returns to Today', async () => {
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test('child mode: the Chipper Chart button opens the sheet, plus works, then unlock', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const lockSheet = page.getByRole('dialog', { name: 'Lock this device' });

    await enterPin(page, '2468');
    await expect(lockSheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '2468');

    // show_chipper_chart defaults to true (lib/device/settings.ts).
    await expect(lockSheet.getByRole('switch', { name: 'Show Chipper Chart' })).toHaveAttribute('aria-checked', 'true');
    await lockSheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');

    await page.getByRole('button', { name: 'Chipper Chart', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Chipper Chart' });
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S32 child chipper chart sheet');
    await snap(page, 's32-child-chipper-chart');

    const sheetBar = sheet.getByRole('slider', { name: 'Mood level' });
    const before = Number(await sheetBar.getAttribute('aria-valuenow'));
    // The earlier S35 test can leave the level at MOOD_MAX (disabling Increase), so pick
    // whichever control is actually enabled rather than assuming Increase always is.
    const increase = sheet.getByRole('button', { name: 'Increase mood', exact: true });
    const useIncrease = await increase.isEnabled();
    const control = useIncrease ? increase : sheet.getByRole('button', { name: 'Decrease mood', exact: true });
    await control.click();
    await expect(sheetBar).toHaveAttribute('aria-valuenow', String(before + (useIncrease ? 1 : -1)));
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    await enterPin(page, '2468');
    await page.waitForURL('**/today/', { timeout: 5_000 });
  });
});
