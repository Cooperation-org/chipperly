import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** The signed-in session's access token, straight from Dexie's kv table (lib/api/client.ts TOKENS_KEY). */
async function accessToken(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('chipperly');
        open.onsuccess = () => {
          const req = open.result.transaction('kv').objectStore('kv').get('auth_tokens');
          req.onsuccess = () => resolve((req.result as { value: { access_token: string } }).value.access_token);
        };
      }),
  );
}

// "Phone is resting", sent the way a caregiver does from Settings > Devices
// on another device (POST /me/devices/:id/rest). The native side (blocking
// every app, surviving a reboot) can't run in a browser; this covers the
// profile setting reaching the child view and the PIN ending it.
test.describe('child view: phone is resting', () => {
  let page: Page;
  let deviceId: string;
  let auth: Record<string, string>;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Resting Tester' });
    auth = { authorization: `Bearer ${await accessToken(page)}` };
    deviceId = await page.evaluate(() => crypto.randomUUID());
    const profileId = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const open = indexedDB.open('chipperly');
          open.onsuccess = () => {
            const req = open.result.transaction('profiles').objectStore('profiles').getAll();
            req.onsuccess = () => resolve((req.result as { id: string }[])[0]!.id);
          };
        }),
    );
    await page.request.put(`/api/me/devices/${deviceId}`, { headers: auth, data: { platform: 'android' } });
    await page.request.patch(`/api/me/devices/${deviceId}`, { headers: auth, data: { profile_id: profileId } });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('lock the device, then a remote Rest shows only the resting page', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');

    const rest = await page.request.post(`/api/me/devices/${deviceId}/rest`, { headers: auth, data: { resting: true } });
    expect(rest.ok()).toBe(true);
    // Reaches this device through the next sync pull (a reload runs one straight away).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Phone is resting' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveCount(0);
    await expectNoOverflow(page, 'child resting');
    await snap(page, 'child-resting');
  });

  test('the caregiver PIN ends resting', async () => {
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 10_000 });

    const profileResting = await page.evaluate(
      () =>
        new Promise<boolean | undefined>((resolve) => {
          const open = indexedDB.open('chipperly');
          open.onsuccess = () => {
            const req = open.result.transaction('profiles').objectStore('profiles').getAll();
            req.onsuccess = () => resolve((req.result as { settings: { resting?: boolean } }[])[0]!.settings.resting);
          };
        }),
    );
    expect(profileResting).toBe(false);
  });
});
