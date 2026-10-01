import { test, expect } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

/** The local date `days` from now as YYYY-MM-DD, the way the app's date fields write it. */
function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('a caregiver adds a one-off event on Today and sees it under Coming up', async ({ page }) => {
  await signUp(page, { name: 'Coming Up Tester' });

  const section = page.getByRole('region', { name: 'Coming up' });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText('Appointments, lessons and visits show up here.')).toBeVisible();

  await section.getByRole('button', { name: 'Add an event', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('What is happening', { exact: true }).fill('Horse lesson');
  await sheet.getByLabel('Day', { exact: true }).fill(isoIn(4));
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();

  await expect(section.getByText('Horse lesson')).toBeVisible();
  await expect(section.getByText('in 4 days')).toBeVisible();
  await expect(section.getByText('Appointments, lessons and visits show up here.')).toHaveCount(0);
  await expectNoOverflow(page, 'today coming up');

  // A routine-style repeat is not "coming up": it is just the schedule.
  await section.getByRole('button', { name: 'Add an event', exact: true }).click();
  await page.getByRole('dialog').getByLabel('What is happening', { exact: true }).fill('Daily walk');
  await page.getByRole('dialog').getByRole('combobox', { name: 'How often' }).selectOption({ label: 'Every day' });
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(section.getByText('Daily walk')).toHaveCount(0);
});
