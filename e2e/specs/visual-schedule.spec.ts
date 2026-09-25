import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/**
 * S36 Visual schedule: the step tree, its "Break down" editor, the
 * full-screen overlay opened from a routine or a single step, and the
 * print CSS that leaves only that overlay on the page.
 */
test.describe('visual schedule', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Visual Schedule Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Break down builds a step tree that saves and shows on Today', async () => {
    // The starter plan materializes async on mount; wait for it so the
    // floating "Add activity" button is the only match (not still
    // ambiguous with the empty state's button of the same name). Named "Get
    // Ready", not "Get Dressed": the starter plan already seeds a recurring
    // "Get Dressed", and a same-named activity here would make every
    // row/checkbox lookup below ambiguous.
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');

    await page.getByLabel('Name', { exact: true }).fill('Get Ready');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Brush teeth');

    // Break down the same step (its own button is always the first one in
    // document order) twice, giving it two sub-steps.
    await page.getByRole('button', { name: 'Add sub-steps', exact: true }).nth(0).click();
    await page.getByLabel('Step 2', { exact: true }).fill('Turn on tap');
    await page.getByRole('button', { name: 'Add sub-steps', exact: true }).nth(0).click();
    await page.getByLabel('Step 3', { exact: true }).fill('Rinse');

    await expectNoOverflow(page, 'S9 activity form with a broken-down step');
    await snap(page, 's9-activity-form-break-down');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
    await expect(page.getByRole('checkbox', { name: /^Get Ready,/ })).toBeVisible();
  });

  test('S7 item sheet: Open as visual schedule, check the parent cascades to both children, print', async () => {
    await page.locator('button[class*="ListRow_main"]', { hasText: 'Get Ready' }).click();
    const itemSheet = page.getByRole('dialog');
    await expect(itemSheet).toBeVisible();

    await itemSheet.getByRole('button', { name: 'Open as visual schedule', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Get Ready' });
    await expect(overlay).toBeVisible();
    // One parent step; its two sub-steps open when the card is tapped.
    await expect(overlay.getByRole('checkbox')).toHaveCount(1);
    await overlay.getByRole('button', { name: 'Brush teeth', expanded: false }).click();
    await expect(overlay.getByRole('checkbox')).toHaveCount(3);
    await expect(overlay.getByText('Brush teeth')).toBeVisible();
    await expect(overlay.getByText('Turn on tap')).toBeVisible();
    await expect(overlay.getByText('Rinse')).toBeVisible();
    await expectNoOverflow(page, 'S36 visual schedule overlay');
    await snap(page, 's36-visual-schedule');

    const turnOnTap = overlay.getByRole('checkbox', { name: /^Turn on tap,/ });
    const rinse = overlay.getByRole('checkbox', { name: /^Rinse,/ });
    await expect(turnOnTap).toHaveAttribute('aria-checked', 'false');
    await expect(rinse).toHaveAttribute('aria-checked', 'false');

    await overlay.getByRole('checkbox', { name: /^Brush teeth,/ }).click();
    await expect(turnOnTap).toHaveAttribute('aria-checked', 'true');
    await expect(rinse).toHaveAttribute('aria-checked', 'true');

    // Print: with the overlay open, only it should remain on the page —
    // the caregiver shell's tab bar and top bar hide (docs/ux-plan.md
    // section 12), the visual schedule's own rows stay visible.
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('nav[data-shell-tabbar]')).not.toBeVisible();
    await expect(page.locator('header[class*="TopBar_bar"]')).not.toBeVisible();
    await expect(overlay.getByText('Brush teeth')).toBeVisible();
    await expect(overlay.getByText('Turn on tap')).toBeVisible();
    await expect(overlay.getByText('Rinse')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    // Leave one child unchecked (toggling it back off also un-completes the
    // parent, which is fine here) so the next test has something to check.
    await turnOnTap.click();
    await expect(turnOnTap).toHaveAttribute('aria-checked', 'false');
    await expect(rinse).toHaveAttribute('aria-checked', 'true');

    await overlay.getByRole('button', { name: 'Close visual schedule', exact: true }).click();
    await expect(overlay).toBeHidden();
    await itemSheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(itemSheet).toBeHidden();
  });

  test('S32 child today: Steps button opens the overlay, checking a step works locked', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Child view options for/ }).click();
    const lockSheet = page.getByRole('dialog', { name: 'Child view options' });
    await enterPin(page, '1234');
    await expect(lockSheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');

    // On by default (lib/device/settings.ts DEFAULT_LOCK_OPTIONS).
    await expect(lockSheet.getByRole('switch', { name: 'Let Benny open a step list' })).toHaveAttribute('aria-checked', 'true');

    await lockSheet.getByRole('button', { name: 'Save', exact: true }).click();

    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');

    const stepsButton = page.getByRole('button', { name: 'Steps', exact: true });
    await expect(stepsButton).toBeVisible();
    await stepsButton.click();

    const overlay = page.getByRole('dialog', { name: 'Get Ready' });
    await expect(overlay).toBeVisible();
    // Printing is a caregiver action; the child's overlay has only Close.
    await expect(overlay.getByRole('button', { name: 'Print' })).toHaveCount(0);
    await expectNoOverflow(page, 'S32 child visual schedule overlay');
    await snap(page, 's32-child-visual-schedule');

    await overlay.getByRole('button', { name: 'Brush teeth', expanded: false }).click();
    const rinse = overlay.getByRole('checkbox', { name: /^Rinse,/ });
    await expect(rinse).toHaveAttribute('aria-checked', 'true'); // cascaded from the earlier caregiver check
    const turnOnTap = overlay.getByRole('checkbox', { name: /^Turn on tap,/ });
    await expect(turnOnTap).toHaveAttribute('aria-checked', 'false'); // left unchecked by the previous test
    // Owner, 26 Sept: the whole card is the target, not just the small circle. Tap the words.
    await overlay.getByText('Turn on tap', { exact: true }).click();
    await expect(turnOnTap).toHaveAttribute('aria-checked', 'true');

    await overlay.getByRole('button', { name: 'Close visual schedule', exact: true }).click();
    await expect(overlay).toBeHidden();

    // Leave the suite unlocked.
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
  });
});
