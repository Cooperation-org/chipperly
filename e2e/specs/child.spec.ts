import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap, tapTarget, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

test.describe('child mode', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Child Tester' });

    // Two items on today: a seeded activity, and a fresh one with a step.
    // The empty state's "Add activity" Button and the floating + IconButton
    // share that accessible name; the list is still empty here.
    await page.locator('div[class*="EmptyState_wrap"]').getByRole('button', { name: 'Add activity', exact: true }).click();
    let sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Wake Up', exact: true }).click();
    await expect(toast(page)).toContainText('Added Wake Up');

    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Get Dressed With Steps');
    await page.getByRole('button', { name: /^Steps/ }).click();
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await page.getByLabel('Step 1', { exact: true }).fill('Put on shirt');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S23 lock this device with a PIN', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Lock this device to/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Lock this device' });
    await expect(sheet).toBeVisible();
    await expectNoOverflow(page, 'S23 lock this device (set PIN)');
    await snap(page, 's23-lock-set-pin');

    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');

    await expect(sheet.getByRole('switch', { name: 'Show free-time choices' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('switch', { name: 'Ask how it went after each task' })).toHaveAttribute('aria-checked', 'true');
    await expectNoOverflow(page, 'S23 lock this device (toggles)');
    await snap(page, 's23-lock-toggles');

    await sheet.getByRole('button', { name: 'Lock', exact: true }).click();
    await page.waitForURL('**/child/');
  });

  test('S32 child today: header, no tab bar, no settings gear', async () => {
    await expect(page.getByRole('heading', { name: 'Benny' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'S32 child today');
    await snap(page, 's32-child-today');
  });

  test('child rows and check circles meet the minimum tap size', async () => {
    // CheckCircle is a fixed 64px in child mode at every breakpoint
    // (components/ui/CheckCircle.module.css); the row itself grows on
    // tablets (components/child/ChildToday.module.css, >=768px: 96px rows,
    // ux-plan.md section 12).
    const checkbox = page.getByRole('checkbox', { name: /^Wake Up,/ });
    await tapTarget(checkbox);
    const box = await checkbox.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(60);

    const viewport = page.viewportSize();
    const isTabletOrWider = (viewport?.width ?? 0) >= 768;
    const row = page.locator('div[class*="ChildToday_row"]').first();
    const rowBox = await row.boundingBox();
    expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(isTabletOrWider ? 90 : 64);
  });

  test('check off a row: chip strip updates, attitude prompt, tap Good', async () => {
    // Chip strip only renders once there's a reward or a balance (ux-plan.md
    // S32); checking off a chip-earning row is what makes it appear.
    const chipStrip = page.getByRole('button', { name: /of \d+ chips/ });
    await expect(chipStrip).toHaveCount(0);

    await page.getByRole('checkbox', { name: /^Wake Up,/ }).click();
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveAttribute('aria-checked', 'true');

    await expect(chipStrip).toHaveAttribute('aria-label', /^1 of \d+ chips/);

    const good = page.getByRole('button', { name: 'Good', exact: true });
    await expect(good).toBeVisible();
    await expectNoOverflow(page, 'S32 child today with attitude prompt');
    await snap(page, 's32-child-attitude-prompt');
    await good.click();
  });

  test('free time button opens the choices sheet', async () => {
    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('S24 lock glyph -> PIN pad -> wrong then correct PIN', async () => {
    // BUG PIN hash/verify mismatch: apps/api/src/lib/password.ts's
    // hashPin()/verifyPin() call Node's `pbkdf2(pin, salt, ...)` with
    // `salt` as the base64url *string* (`randomBytes(16).toString(
    // 'base64url')`) instead of decoding it back to the raw 16 bytes first.
    // Node's `crypto.pbkdf2` treats a string salt as UTF-8 text, so the
    // server derives against the UTF-8 bytes of the base64url text, not the
    // original random bytes. apps/web/lib/auth/pin.ts's WebCrypto
    // hashPin()/verifyPin() (correctly) decode the salt back to raw bytes
    // first. The PIN is *set* through the server (PATCH /me/pin ->
    // routes/me.ts -> lib/password.ts hashPin) and *verified* on the client
    // (UnlockOverlay -> lib/auth/pin.ts verifyPin against the cached
    // pin_hash): two different salt interpretations for the same stored
    // hash, so every unlock attempt fails, correct PIN or not — CONTRACTS.md
    // "PIN" requires this to verify identically on both sides. See
    // openIssues.
    test.fail(true, 'BUG auth: PIN set via the server / verified on the client never matches (salt encoding mismatch) — see openIssues');

    await page.getByRole('button', { name: 'Caregiver unlock', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Unlock' });
    await expect(overlay).toBeVisible();
    await expectNoOverflow(page, 'S24 pin pad');
    await snap(page, 's24-pin-pad');

    await enterPin(page, '9999');
    await expect(overlay.getByRole('alert')).toContainText('Wrong PIN');

    await enterPin(page, '1234');
    await page.waitForURL('**/today/', { timeout: 5_000 });
    await expectNoOverflow(page, 'back at today after unlock');
  });
});
