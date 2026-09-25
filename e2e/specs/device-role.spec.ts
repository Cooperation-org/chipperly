import { test, expect, type Page } from '@playwright/test';
import { signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

// Who uses this device (lib/device/role.ts) and whether a child uses the app
// at all (profile setting child_uses_app).
test.describe('device role and children who use the app', () => {
  let page: Page;
  let password = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Role Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('a browser is the caregiver device: a reload stays on Today, no child view or PIN', async () => {
    await page.reload();
    await page.waitForURL('**/today/');
    await expect(page.locator('nav[aria-label="Primary"]:visible')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Team unlock' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Who uses this device/ })).toContainText('Me, a team member');
  });

  test('a child who does not use the app has no lock or child view options', async () => {
    await expect(page.getByRole('button', { name: /^Lock to / })).toBeVisible();
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    await page.getByRole('switch', { name: 'Uses Chipperly themselves' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Child view' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');
    await expect(page.getByRole('button', { name: /Child view options for/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Lock to / })).toHaveCount(0);
  });

  test("marking this device as the child's opens their view, and caregiver screens need unlocking again", async () => {
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('switch', { name: 'Uses Chipperly themselves' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /^Who uses this device/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /'s device/ }).click();
    await page.waitForURL('**/child/**');
    await expect(page.getByRole('button', { name: 'Team unlock', exact: true })).toBeVisible();

    await page.goto('/today/');
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.waitForURL('**/today/');
  });
});
