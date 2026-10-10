import { expect, test } from '@playwright/test';
import { signUp } from '../helpers';

// Two tabs share the stored tokens. When the access token is dead both refresh at once; before the
// Web Lock in lib/api/client.ts the second was refused and signed the person out.
test('two tabs refresh at once and both stay signed in', async ({ page, context }) => {
  await signUp(page, { name: 'Refresh Check' });
  await page.goto('/today/');
  await page.waitForTimeout(2500);
  const second = await context.newPage();
  await second.goto('/today/');
  await second.waitForTimeout(2500);

  const hasLocks = await page.evaluate(() => typeof navigator.locks);
  const readTokens = () =>
    page.evaluate(
      () =>
        new Promise<{ access_token: string; refresh_token: string } | null>((res) => {
          const r = indexedDB.open('chipperly');
          r.onsuccess = () => {
            const q = r.result.transaction('kv').objectStore('kv').get('auth_tokens');
            q.onsuccess = () => {
              r.result.close();
              res(q.result ? q.result.value : null);
            };
          };
        }),
    );
  const before = await readTokens();
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('chipperly');
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readwrite');
          const st = tx.objectStore('kv');
          const q = st.get('auth_tokens');
          q.onsuccess = () => st.put({ key: 'auth_tokens', value: { ...q.result.value, access_token: 'expired.token.value' } });
          tx.oncomplete = () => {
            r.result.close();
            res(true);
          };
        };
      }),
  );

  const refreshes: string[] = [];
  for (const [name, p] of [['A', page], ['B', second]] as const) p.on('response', (r) => void (r.url().includes('/api/auth/refresh') && refreshes.push(`${name}:${r.status()}`)));
  await Promise.all([page.reload(), second.reload()]);
  await page.waitForTimeout(7000);

  const after = await readTokens();
  expect(hasLocks).toBe('object');
  expect(before?.refresh_token).not.toBe(after?.refresh_token);
  expect(after?.access_token).toBeTruthy();
  expect(after?.access_token).not.toBe('expired.token.value');
  expect(refreshes.filter((r) => r.endsWith(':401'))).toEqual([]);
  expect(refreshes.length).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Chips' })).toBeVisible();
  await expect(second.getByRole('link', { name: 'Chips' })).toBeVisible();
});
