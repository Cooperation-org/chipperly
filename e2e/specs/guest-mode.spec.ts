import { test, expect } from '@playwright/test';

// Guest mode: "Try it without an account" makes a session entirely on the device. Nothing may reach
// the API, and everything is erased 48 hours after it started (lib/auth/guest.ts, guestExpiry.ts).

const HOUR = 60 * 60 * 1000;

test('guest session stays on the device and is erased after 48 hours', async ({ page }) => {
  const apiRequests: string[] = [];

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText("Nothing is saved to our servers. It's erased from this device after 48 hours.")).toBeVisible();
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) apiRequests.push(`${request.method()} ${request.url()}`);
  });

  await page.getByRole('button', { name: 'Try it without an account', exact: true }).click();
  await page.waitForURL('**/today/');

  // The sample child's routines, and the banner.
  await expect(page.getByText('Sample child').first()).toBeVisible();
  const banner = page.getByText(/Trying Chipperly\. Erased in (\d+ hours?|less than an hour)\./);
  await expect(banner).toBeVisible();
  // Dismissing is for good: it stays gone after a reload.
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByText('Sample child').first()).toBeVisible();
  await expect(banner).toBeHidden();
  const routine = page.getByRole('checkbox', { name: /^Morning Routine,/ });
  await expect(routine).toBeVisible();
  await expect(routine).toHaveAttribute('aria-checked', 'false');
  await routine.click();
  await expect(routine).toHaveAttribute('aria-checked', 'true');

  // Server-only settings are gone, with the reason given where the account section would be.
  await page.goto('/settings/');
  await expect(page.getByText('Create a free account to use this.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Team/ })).toHaveCount(0);

  // Reload: still a guest, and the check held.
  await page.goto('/today/');
  const after = page.getByRole('checkbox', { name: /^Morning Routine,/ });
  await expect(after).toHaveAttribute('aria-checked', 'true');

  expect(apiRequests, 'no request to the API while a guest').toEqual([]);

  // Pretend it started 49 hours ago.
  await page.evaluate(
    (startedAt) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'guest_started_at', value: startedAt });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    Date.now() - 49 * HOUR,
  );
  await page.reload();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('button', { name: 'Try it without an account', exact: true })).toBeVisible();
  const leftover = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('activities').objectStore('activities').count();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
  expect(leftover).toBe(0);
  expect(apiRequests, 'no request to the API after the reset').toEqual([]);
});
