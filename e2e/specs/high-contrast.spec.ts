import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';
const YELLOW = 'rgb(255, 212, 0)';

function css(locator: Locator, prop: string): Promise<string> {
  return locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/** WCAG contrast ratio between two `rgb(...)` strings. */
function contrast(a: string, b: string): number {
  const lum = (rgb: string) => {
    const [r, g, bl] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Owner, 25 Sept 2026: a high-contrast option like the CVI supports a parent uses with her son. */
test.describe('high contrast (CVI) child view', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Contrast Tester' });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();

    // A routine with steps, so the visual schedule can be checked too.
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Get Ready');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Shoes on');
    await page.getByLabel('Step 1', { exact: true }).press('Enter');
    await page.getByLabel('Step 2', { exact: true }).fill('Coat on');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  async function lock(): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Child view options for/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Child view options' });
    const save = sheet.getByRole('button', { name: 'Save', exact: true });
    const keypad = sheet.getByRole('button', { name: '1', exact: true });
    // First time: set a PIN (twice). Once one exists, the sheet opens straight to the options.
    await expect(save.or(keypad)).toBeVisible();
    if (await keypad.isVisible()) {
      await enterPin(page, '1234');
      await expect(sheet.getByText('Enter it again')).toBeVisible();
      await enterPin(page, '1234');
    }
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
  }

  async function unlock(): Promise<void> {
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/');
  }

  test('off by default: the child view keeps its usual light colours', async () => {
    await lock();
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'cvi');
    await expect(page.locator('body')).not.toHaveCSS('background-color', BLACK);
    await unlock();
  });

  test('turn on "High contrast (CVI)" in the profile', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    const toggle = page.getByRole('switch', { name: 'High contrast (CVI)' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');
  });

  test('child view: black background, white text, thick yellow outlines', async () => {
    await lock();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'cvi');
    await expect(page.locator('body')).toHaveCSS('background-color', BLACK);

    const card = page.locator('div[class*="ChildToday_card"]').first();
    await expect(card).toHaveCSS('background-color', BLACK);
    await expect(card).toHaveCSS('border-top-color', YELLOW);
    await expect(card).toHaveCSS('border-top-width', '3px');

    const name = page.locator('span[class*="ChildToday_rowName"]').first();
    await expect(name).toHaveCSS('color', WHITE);
    const textColour = await css(name, 'color');
    // WCAG AAA for text is 7:1; white and yellow on black are 21:1 and about 14:1.
    expect(contrast(textColour, BLACK)).toBeGreaterThanOrEqual(7);
    expect(contrast(YELLOW, BLACK)).toBeGreaterThanOrEqual(7);

    const check = page.getByRole('checkbox', { name: /^Wake Up,/ });
    await expect(check).toHaveCSS('border-top-color', YELLOW);

    await expectNoOverflow(page, 'child view, high contrast');
    await snap(page, 'child-high-contrast');
  });

  test('a sheet the child opens is high contrast too', async () => {
    await page.getByRole('button', { name: 'How do I feel?', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'How do I feel?' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS('background-color', BLACK);
    // The faces fit their boxes with the thick borders too.
    for (const f of await sheet.getByRole('group', { name: 'How it felt' }).getByRole('button').all()) {
      const box = await f.boundingBox();
      const glyph = await f.locator('span').boundingBox();
      expect((glyph?.width ?? 999) <= (box?.width ?? 0) && (glyph?.height ?? 999) <= (box?.height ?? 0)).toBe(true);
    }
    const face = sheet.getByRole('button', { name: 'Great', exact: true });
    await expect(face).toHaveCSS('border-top-color', YELLOW);
    await expectNoOverflow(page, 'child sheet, high contrast');
    await snap(page, 'child-sheet-high-contrast');
    await face.click();
    await expect(sheet).toBeHidden();
  });

  test('the visual schedule is high contrast too', async () => {
    await page.getByRole('button', { name: 'Steps', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Get Ready' });
    await expect(overlay).toBeVisible();
    await expect(page.locator('div[class*="VisualSchedule_overlay"]')).toHaveCSS('background-color', BLACK);
    const row = overlay.locator('div[class*="VisualSchedule_rowMain"]').first();
    await expect(row).toHaveCSS('background-color', BLACK);
    await expect(overlay.getByText('Shoes on', { exact: true })).toHaveCSS('color', WHITE);
    await expectNoOverflow(page, 'visual schedule, high contrast');
    await snap(page, 'visual-schedule-high-contrast');
    await overlay.getByRole('button', { name: 'Close visual schedule', exact: true }).click();
  });

  test('tapping anywhere on a task bar ticks it', async () => {
    const check = page.getByRole('checkbox', { name: /^Breakfast,/ });
    await expect(check).toHaveAttribute('aria-checked', 'false');
    await page.locator('span[class*="ChildToday_rowName"]', { hasText: /^Breakfast$/ }).click();
    await expect(check).toHaveAttribute('aria-checked', 'true');
  });

  test('back in the team view, the usual colours return', async () => {
    await unlock();
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'cvi');
    await expect(page.locator('body')).not.toHaveCSS('background-color', BLACK);
  });

  test('the setting survived locking right after saving it (lock waits for the save to sync)', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    await expect(page.getByRole('switch', { name: 'High contrast (CVI)' })).toHaveAttribute('aria-checked', 'true');
  });
});
