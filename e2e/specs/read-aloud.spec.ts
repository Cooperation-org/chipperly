import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** What lib/speech.ts asked the browser to say, newest last (speechSynthesis is swapped for a recorder). */
function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
}

test.describe('read aloud', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(() => {
      const said: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = said;
      const w = window as unknown as Record<string, unknown>;
      if (typeof w.SpeechSynthesis === 'function') {
        // Patched on the prototype: WebKit won't let window.speechSynthesis itself be redefined.
        SpeechSynthesis.prototype.speak = function (u: SpeechSynthesisUtterance) {
          said.push(u.text);
        };
        SpeechSynthesis.prototype.cancel = () => {};
      } else {
        // Playwright's Windows WebKit has no speech API at all (a real iPad does): stand one in.
        w.SpeechSynthesisUtterance = class {
          constructor(public text: string) {}
        };
        w.speechSynthesis = { speak: (u: { text: string }) => said.push(u.text), cancel: () => {} };
      }
    });
    await signUp(page, { name: 'Read Aloud Tester' });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('turn on "Read tasks aloud" and lock to the child view', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    await page.getByRole('switch', { name: 'Read tasks aloud' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');

    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  });

  test('the speaker says a task, and ticking it says "done"', async () => {
    await page.getByRole('button', { name: 'Say Wake Up', exact: true }).click();
    await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Wake Up');
    await expectNoOverflow(page, 'child read aloud');
    await snap(page, 'child-read-aloud');

    await page.getByRole('checkbox', { name: /^Wake Up,/ }).click();
    await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Wake Up, done!');
  });
});
