import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** Each face's picture sits inside its button (it used to outgrow it in child mode). One in-page measurement: the prompt fades after 10s. */
async function expectFacesFit(scope: Locator): Promise<void> {
  const group = scope.getByRole('group', { name: 'How it felt' });
  await expect(group.getByRole('button')).toHaveCount(5);
  const overflows = await group.evaluate((el) =>
    [...el.querySelectorAll('button')].filter((b) => {
      const box = b.getBoundingClientRect();
      const glyph = b.querySelector('span')?.getBoundingClientRect();
      return !glyph || glyph.width > box.width || glyph.height > box.height;
    }).length,
  );
  expect(overflows).toBe(0);
}

/** Owner feedback 25 Sept 2026: five-face feelings, the check-ups, and the whole-routine bonus. */
test.describe('feelings, check-ups and the whole-routine bonus', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Feelings Tester' });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();

    // A two-step routine for today.
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Pack Bag');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Lunch box');
    await page.getByLabel('Step 1', { exact: true }).press('Enter');
    await page.getByLabel('Step 2', { exact: true }).fill('Water bottle');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('turn on a +2 whole-routine bonus, child ordering and big pictures in the profile', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    await page.getByRole('combobox', { name: 'Whole-routine bonus' }).selectOption({ label: '+2' });
    await page.getByRole('switch', { name: 'Child can change the order of the day' }).click();
    await page.getByRole('switch', { name: 'Big pictures, fewer words' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');
  });

  test('lock to the child view', async () => {
    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  });

  test('child: big pictures, fewer words', async () => {
    await expect(page.getByRole('checkbox', { name: /^Pack Bag,/ })).toBeVisible();
    // The "0/2 steps done" line is text the check star already shows.
    await expect(page.getByText(/steps done/)).toBeHidden();
    await expectNoOverflow(page, 'child picture mode');
    await snap(page, 'child-picture-mode');
  });

  test('child: puts the day in their own order', async () => {
    const names = async () =>
      (
        await page
          .locator('div[class*="ChildToday_row"]')
          .getByRole('checkbox')
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
      ).map((l) => l.split(',')[0]);
    const before = await names();
    await page.getByRole('button', { name: 'Change my order', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'My order' });
    await sheet.getByRole('button', { name: `Move ${before[0]} down`, exact: true }).click();
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);
  });

  test('child: "How do I feel?" any time', async () => {
    await page.getByRole('button', { name: 'How do I feel?', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'How do I feel?' });
    await expect(sheet.getByRole('button', { name: 'Very upset', exact: true })).toBeVisible();
    await expectNoOverflow(page, 'child how do I feel');
    await sheet.getByRole('button', { name: 'Great', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('child: five faces after a task (tapping the task bar, not just the circle)', async () => {
    // Owner, 26 Sept: the whole bar ticks the task.
    await page.locator('span[class*="ChildToday_rowName"]', { hasText: /^Wake Up$/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('How did it feel?')).toBeVisible();
    await expectFacesFit(page.locator('div[class*="ChildToday_card"]', { hasText: 'How did it feel?' }));
    await snap(page, 'child-feeling-after-task');
    await page.getByRole('button', { name: 'Okay', exact: true }).click();
    await expect(page.getByText('How did it feel?')).toHaveCount(0);
  });

  test('child: a routine done in one go earns its chip plus the bonus', async () => {
    const strip = page.getByRole('button', { name: /of \d+ chips/ });
    const before = Number((await strip.getAttribute('aria-label'))?.match(/^(\d+)/)?.[1]);
    await page.getByRole('checkbox', { name: /^Pack Bag,/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Pack Bag,/ })).toHaveAttribute('aria-checked', 'true');
    await expect(strip).toHaveAttribute('aria-label', new RegExp(`^${before + 3} of`));
    // Answer the after-task faces so they don't sit over the check-up button.
    await page.getByRole('button', { name: 'Good', exact: true }).click();
  });

  test('child: end-of-day check-up, with what was hard', async () => {
    await page.getByRole('button', { name: 'Check-up', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Check-up' });
    await expect(sheet.getByText('How was your day?')).toBeVisible();
    await sheet.getByRole('button', { name: 'A bit upset', exact: true }).click();
    await expect(sheet.getByText('Was anything hard?')).toBeVisible();
    await sheet.getByRole('button', { name: /Wake Up/ }).click();
    await expectNoOverflow(page, 'child check-up hard tiles');
    await snap(page, 'child-checkup');
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('team: day check-up with a note', async () => {
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/');
    await page.getByRole('button', { name: 'Day check-up', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Day check-up' });
    await expect(sheet.getByText(/feelings,/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Good', exact: true }).click();
    await sheet.getByLabel('Note (optional)').fill('The bus was hard.');
    await sheet.getByRole('button', { name: 'Save check-up', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('Feelings: one timeline for the day, and the week chart', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Feelings' }).click();
    await page.waitForURL('**/settings/attitude/');

    await expect(page.getByText('Last 7 days, average feeling')).toBeVisible();
    await expect(page.getByText('Right now: Great')).toBeVisible();
    await expect(page.getByText('Wake Up: Okay')).toBeVisible();
    await expect(page.getByText('Check-up: A bit upset')).toBeVisible();
    await expect(page.getByText('Hard: Wake Up')).toBeVisible();
    await expect(page.getByText(/^Team check-up.*: Good$/)).toBeVisible();
    await expect(page.getByText('The bus was hard.')).toBeVisible();
    await expectNoOverflow(page, 'feelings history');
    await snap(page, 'feelings-history');
  });
});
