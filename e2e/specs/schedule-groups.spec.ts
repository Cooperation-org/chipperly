import { test, expect } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The same calendar rule the app uses: 1 is Tomorrow, 2 to 7 This week, then by calendar month. */
function groupFor(days: number): string {
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return 'This week';
  const now = new Date();
  const then = new Date();
  then.setDate(now.getDate() + days);
  const ahead = then.getFullYear() * 12 + then.getMonth() - (now.getFullYear() * 12 + now.getMonth());
  return ahead <= 0 ? 'Later this month' : ahead === 1 ? 'Next month' : 'Later';
}

test('Coming up groups one-off events added from the unified Add', async ({ page }) => {
  await signUp(page, { name: 'Groups Tester' });

  const days = [1, 4, 20, 40];
  for (const n of days) {
    await page.getByRole('button', { name: 'Add activity', exact: true }).last().click();
    const picker = page.getByRole('dialog');
    await expect(picker.getByText('Repeats on days you choose. Has steps and chips.')).toBeVisible();
    await picker.getByRole('button', { name: 'One-off event or appointment', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('What is happening', { exact: true }).fill(`Event in ${n}`);
    await sheet.getByLabel('Day', { exact: true }).fill(isoIn(n));
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  const section = page.getByRole('region', { name: 'Coming up' });
  await section.scrollIntoViewIfNeeded();
  // Four rows show at first, so every event is visible without Show more.
  for (const n of days) {
    const group = section.getByRole('region', { name: groupFor(n), exact: true });
    await expect(group.getByRole('heading', { name: groupFor(n), exact: true })).toBeVisible();
    await expect(group.getByText(`Event in ${n}`)).toBeVisible();
  }
  await expect(section.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expectNoOverflow(page, 'today coming up groups');
});
