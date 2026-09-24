import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');

export interface SignUpResult {
  email: string;
  password: string;
  name: string;
}

// e2e/server.mjs sets BETA_INVITE_CODE so every real sign-up in this suite needs it.
const BETA_INVITE_CODE = 'e2e-beta-code';

/**
 * Real UI sign-up flow: /sign-up/ -> onboarding kind "My family" -> first
 * profile (name + an emoji) -> Ready -> /today/. Tokens live in IndexedDB
 * (lib/auth/session.ts), not cookies, so every spec signs up its own fresh
 * account with a unique email rather than reusing storageState.
 */
export async function signUp(page: Page, opts: { name: string; email?: string }): Promise<SignUpResult> {
  const password = 'correct-horse-battery-staple';
  let email = '';

  // Environmental, not app or test logic: on this machine, the very first
  // request after a fresh Chromium context/API round-trip occasionally
  // stalls for the rest of the test budget (observed only in full,
  // back-to-back suite runs, never isolated or paired files — consistent
  // with Windows loopback/ephemeral-port pressure building up over a long
  // run, not a deadlock: server and Postgres both sit fully idle for the
  // duration). A short, bounded retry with a fresh email (in case the
  // first attempt actually landed server-side) is cheap insurance.
  let landed = false;
  for (let attempt = 0; attempt < 3 && !landed; attempt += 1) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${attempt}`;
    email = opts.email ?? `e2e-${unique}@example.com`;

    await page.goto('/sign-up/');
    await page.getByLabel('Name', { exact: true }).fill(opts.name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
    if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
    // S2's required consent checkbox (SOW Q21 / COPPA): Create account stays disabled without it.
    await page.getByRole('checkbox', { name: /parent, guardian, or an authorised caregiver/i }).check();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    landed = await page
      .waitForURL('**/onboarding/kind/', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }
  expect(landed, 'reached /onboarding/kind/ after sign-up').toBe(true);
  await page.getByRole('button', { name: /My family/ }).click();

  await page.waitForURL('**/onboarding/profile/');
  await page.getByLabel('Name', { exact: true }).fill('Benny');
  // PicturePicker's emoji grid is open by default (ux-plan.md: "Emoji is
  // default so nobody is blocked by a photo"), so no toggle click is needed
  // here — clicking the "Emoji" button would instead *close* it.
  await page
    .getByRole('radiogroup', { name: 'Choose a picture' })
    .getByRole('radio')
    .first()
    .click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.waitForURL('**/onboarding/ready/');
  await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
  await page.waitForURL('**/today/');

  // The sync engine schedules an immediate cycle when the profile lands in
  // Dexie (lib/sync/engine.ts subscribes to db.profiles' 'creating' hook),
  // so the seeded Home/School locations show up without forcing "Sync now".
  await gotoTab(page, 'chips');
  await expect(page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio').first()).toBeVisible({
    timeout: 20_000,
  });
  await gotoTab(page, 'today');

  return { email, password, name: opts.name };
}

/**
 * The toast host (lib/toast.tsx). Scoped by class rather than
 * `page.getByRole('status')`, which also matches the unverified-email
 * VerifyBanner on Today (components/auth/VerifyBanner.tsx is `role="status"`
 * too).
 */
export function toast(page: Page): Locator {
  return page.locator('div[class*="toast_toast"]');
}

export type TabName = 'today' | 'chips' | 'timer' | 'first-then' | 'stories';

const TAB_LABEL: Record<TabName, string> = {
  today: 'Today',
  chips: 'Chips',
  timer: 'Timer',
  'first-then': 'First-Then',
  stories: 'Stories',
};

/** Clicks a tab in whichever of TabBar/TabRail is actually visible at the current viewport. */
export async function gotoTab(page: Page, tab: TabName): Promise<void> {
  const nav = page.locator('nav[aria-label="Primary"]:visible');
  await nav.getByRole('link', { name: TAB_LABEL[tab], exact: true }).click();
  await page.waitForURL(`**/${tab}/`);
}

/**
 * Every full navigation resets parent_mode to false (session.ts's bootstrap
 * -- S24's "never stays unlocked" threat model), so a fresh `page.goto()` or
 * `page.reload()` on a caregiver-only route bounces to /child/?next=<path>.
 * That bounce is a client-side redirect fired after hydration, not something
 * `page.goto()` itself waits for, so this waits for whichever of "bounced"
 * or "already on the caregiver route" actually happens next rather than
 * snapshotting `page.url()` immediately (a snapshot races hydration --
 * reliably lost on a loaded CI runner even though it usually won locally).
 * Unlocks with the account password (a freshly signed-up account has no PIN
 * yet) when it was a bounce; CaregiverShell/UnlockOverlay's `next` plumbing
 * lands back on the originally requested route once unlocked, so callers
 * don't need to navigate again afterward.
 */
async function unlockIfBounced(page: Page, path: string, password: string): Promise<void> {
  const unlockButton = page.getByRole('button', { name: 'Caregiver unlock', exact: true });
  // :visible, not just present: CaregiverShell always renders both
  // TabBar and TabRail (CSS hides one per breakpoint), so an unqualified
  // match here is two elements and .waitFor() on the wrong (hidden) one
  // never resolves.
  const caregiverNav = page.locator('nav[aria-label="Primary"]:visible');
  await unlockButton.or(caregiverNav).first().waitFor({ state: 'visible' });
  if (!(await unlockButton.isVisible())) return;
  await unlockButton.click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.waitForURL(`**${path}`);
}

/** `page.goto()` to a caregiver-only route, unlocking through the bounce above if needed. */
export async function gotoCaregiver(page: Page, path: string, password: string): Promise<void> {
  await page.goto(path);
  await unlockIfBounced(page, path, password);
}

/** `page.reload()` on a caregiver-only route, unlocking through the bounce above if needed. */
export async function reloadCaregiver(page: Page, password: string): Promise<void> {
  const path = new URL(page.url()).pathname;
  await page.reload();
  await unlockIfBounced(page, path, password);
}

async function enterPinDigits(page: Page, pin: string): Promise<void> {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/**
 * Sets the account's caregiver PIN (Settings > Account > Set device PIN) via
 * client-side navigation only, so it doesn't trip parent_mode's
 * full-navigation reset -- call it right after signUp(), while still
 * unlocked. A cached PIN lets gotoCaregiverPin()/reloadCaregiverPin() below
 * get back into caregiver screens after an offline reload, where the
 * password path (a network /auth/login call) can't.
 */
export async function setCaregiverPin(page: Page, pin: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings/');
  // Not exact: ListRow renders the row's secondary text (the account email)
  // inside the same button, so its accessible name is "Account <email>".
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.waitForURL('**/settings/account/');
  await page.getByRole('button', { name: 'Set device PIN', exact: true }).click();
  await enterPinDigits(page, pin);
  await expect(toast(page)).toContainText('PIN updated');
  await gotoTab(page, 'today');
}

/**
 * Like unlockIfBounced, but through the caregiver PIN pad instead of the
 * account password. UnlockOverlay's PIN path verifies against a hash cached
 * locally at sign-in (CONTRACTS.md "PIN" -- works offline, unlike the
 * password path), so this is the one that can get back into a
 * caregiver-only route after an offline reload or goto. Requires
 * setCaregiverPin() to have run earlier, while online.
 */
export async function unlockPinIfBounced(page: Page, path: string, pin: string): Promise<void> {
  const unlockButton = page.getByRole('button', { name: 'Caregiver unlock', exact: true });
  const caregiverNav = page.locator('nav[aria-label="Primary"]:visible');
  await unlockButton.or(caregiverNav).first().waitFor({ state: 'visible' });
  if (!(await unlockButton.isVisible())) return;
  await unlockButton.click();
  await enterPinDigits(page, pin);
  await page.waitForURL(`**${path}`);
}

/** `page.goto()` to a caregiver-only route, unlocking via PIN through the bounce above if needed (works offline). */
export async function gotoCaregiverPin(page: Page, path: string, pin: string): Promise<void> {
  await page.goto(path);
  await unlockPinIfBounced(page, path, pin);
}

/** `page.reload()` on a caregiver-only route, unlocking via PIN through the bounce above if needed (works offline). */
export async function reloadCaregiverPin(page: Page, pin: string): Promise<void> {
  const path = new URL(page.url()).pathname;
  await page.reload();
  await unlockPinIfBounced(page, path, pin);
}

/**
 * Asserts the document has no horizontal scroll and no visible element (that
 * isn't explicitly opted out) sticks out past the viewport edges.
 */
export async function expectNoOverflow(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    const offenders: string[] = [];

    const all = document.querySelectorAll<HTMLElement>('body *');
    for (const el of all) {
      if (el.closest('[aria-hidden="true"], [data-overflow-ok]')) continue;
      if (!(el.offsetParent !== null || el === document.body)) continue;
      if (el.offsetParent === null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) continue;
      if (rect.right > innerWidth + 1 || rect.left < -1) {
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${Array.from(el.classList).slice(0, 2).join('.')}`);
      }
    }
    return { docWidth, innerWidth, offenders: offenders.slice(0, 10) };
  });

  expect(result.docWidth, `${label}: document.documentElement.scrollWidth (${result.docWidth}) should not exceed innerWidth (${result.innerWidth})`).toBeLessThanOrEqual(
    result.innerWidth + 1,
  );
  expect(result.offenders, `${label}: elements overflowing the viewport: ${result.offenders.join(', ')}`).toHaveLength(0);
}

export async function expectVisibleInViewport(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const page = locator.page();
  const viewport = page.viewportSize();
  expect(box, 'locator has a bounding box').not.toBeNull();
  expect(viewport, 'page has a viewport').not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

/** Full-page screenshot to e2e/screenshots/<project>/<name>.png. */
export async function snap(page: Page, name: string): Promise<void> {
  const projectName = test.info().project.name;
  const dir = path.join(SCREENSHOT_DIR, projectName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

/** Asserts a tap target (button/link/checkbox) is at least 44x44 (48 desired, 44 allows rounding). */
export async function tapTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'tap target has a bounding box').not.toBeNull();
  if (!box) return;
  expect(box.width, 'tap target width >= 44').toBeGreaterThanOrEqual(44);
  expect(box.height, 'tap target height >= 44').toBeGreaterThanOrEqual(44);
}
