import { test, expect } from '@playwright/test';
import { gotoCaregiver, reloadCaregiver, signUp } from '../helpers';

// The rewards library's reorder: the drag handle also moves a reward with the arrow keys (the up and down
// buttons hide on narrow phones), and the new order is saved, so it is still there after a reload.
test('a reward moved down in the library stays there after a reload', async ({ page }) => {
  const { password } = await signUp(page, { name: 'Reorder Tester' });
  await gotoCaregiver(page, '/settings/library/rewards/', password);

  const handles = page.locator('[data-reorder$=":handle"]');
  const order = async () => (await handles.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))).map((l) => l.replace(/^Move /, ''));
  await expect(handles.nth(1)).toBeVisible();
  const before = await order();

  await handles.first().focus();
  await page.keyboard.press('ArrowDown');
  const moved = [before[1], before[0], ...before.slice(2)];
  await expect.poll(order).toEqual(moved);

  await reloadCaregiver(page, password);
  await expect(handles.nth(1)).toBeVisible();
  await expect.poll(order).toEqual(moved);
});
