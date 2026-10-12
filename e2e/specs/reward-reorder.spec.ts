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

// Each place has its own order: a reward in Home and School moved in Home keeps its spot in School.
test('a reward in two places moves only in the place it was moved in', async ({ page }) => {
  const { password } = await signUp(page, { name: 'Place Order Tester' });
  await gotoCaregiver(page, '/settings/library/rewards/', password);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  for (const name of ['Ice cream', 'Toy']) await page.getByRole('checkbox', { name: `${name}, not checked`, exact: true }).first().click();
  await page.getByRole('button', { name: 'Set place', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Set places for 2' });
  await dialog.getByRole('radio', { name: 'Replace their places', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Home, not checked', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'School, not checked', exact: true }).click();
  await dialog.getByRole('button', { name: 'Replace with 2 places', exact: true }).click();

  const section = (place: string) => page.locator('section', { has: page.getByRole('heading', { name: place, level: 2, exact: true }) });
  const order = (place: string) => async () =>
    (await section(place).locator('[data-reorder$=":handle"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))).map((l) =>
      l.replace(/^Move /, ''),
    );
  await expect.poll(order('Home')).toEqual(['Ice cream', 'Toy']);
  await expect.poll(order('School')).toEqual(['Ice cream', 'Toy']);

  await section('Home').getByRole('button', { name: 'Move Ice cream', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(order('Home')).toEqual(['Toy', 'Ice cream']);
  await expect.poll(order('School')).toEqual(['Ice cream', 'Toy']);

  await reloadCaregiver(page, password);
  await expect.poll(order('Home')).toEqual(['Toy', 'Ice cream']);
  await expect.poll(order('School')).toEqual(['Ice cream', 'Toy']);
});
