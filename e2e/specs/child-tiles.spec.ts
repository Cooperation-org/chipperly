import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap, tapTarget } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

// The caregiver-chosen picture-tiles home for the child view (profile
// setting child_layout), like the owner's beta "Choose what you want to do".
test.describe('child view: picture tiles', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Tiles Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('caregiver picks "Picture tiles" for the profile, then locks the device', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    const layout = page.getByRole('radiogroup', { name: 'Child view' });
    await expect(layout.getByRole('radio', { name: 'Today list' })).toHaveAttribute('aria-checked', 'true');
    await layout.getByRole('radio', { name: 'Picture tiles' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  });

  test('the child sees tiles, My Day opens the list, Home goes back', async () => {
    await expect(page.getByText('Hi Benny! What do you want to do?')).toBeVisible();
    const myDay = page.getByRole('button', { name: 'My Day', exact: true });
    await tapTarget(myDay);
    // Lock defaults show free time, First-Then and the Chipper Chart, so those tiles are there too.
    for (const name of ['Free time', 'First, then', 'Chipper Chart']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expectNoOverflow(page, 'child tiles home');
    // Short home: nothing to scroll (the screen's full height used to stack on the shell's padding).
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
    await snap(page, 'child-tiles-home');

    await myDay.click();
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByText('Hi Benny! What do you want to do?')).toBeVisible();

    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Free time' })).toBeVisible();
  });
});
