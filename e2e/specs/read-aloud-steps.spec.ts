import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp } from '../helpers';

/** Caregiver Today: each routine step has a speaker that says its name (written, not run in the shared-port session). */
test('a step speaker on Today says the step name', async ({ browser }) => {
  const page: Page = await browser.newPage();
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = said;
    const w = window as unknown as Record<string, unknown>;
    w.SpeechSynthesisUtterance = class {
      constructor(public text: string) {}
    };
    w.speechSynthesis = { speak: (u: { text: string }) => said.push(u.text), cancel: () => {} };
  });
  await signUp(page, { name: 'Step Speaker Tester' });
  await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const routines = sheet.locator('section', { has: page.getByRole('heading', { name: 'Routines', level: 3 }) });
  await routines.getByRole('button', { name: 'New routine', exact: true }).click();
  await page.waitForURL('**/activity/edit/**');
  await page.getByLabel('Step 1', { exact: true }).fill('Wash hands');
  await page.getByRole('button', { name: /^Name/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Speaker Routine');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL('**/today/');

  await page.getByRole('button', { name: 'Expand Speaker Routine steps', exact: true }).click();
  await page.getByRole('button', { name: 'Read step aloud: Wash hands', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1)))
    .toBe('Wash hands');
  await expectNoOverflow(page, 'today step speaker');
  await page.close();
});
