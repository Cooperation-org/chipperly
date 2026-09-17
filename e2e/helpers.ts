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

/**
 * Real UI sign-up flow: /sign-up/ -> onboarding kind "My family" -> first
 * profile (name + an emoji) -> Ready -> /today/. Tokens live in IndexedDB
 * (lib/auth/session.ts), not cookies, so every spec signs up its own fresh
 * account with a unique email rather than reusing storageState.
 */
export async function signUp(page: Page, opts: { name: string }): Promise<SignUpResult> {
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
    email = `e2e-${unique}@example.com`;

    await page.goto('/sign-up/');
    await page.getByLabel('Name', { exact: true }).fill(opts.name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
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

  // BUG (recorded, not fixed here — see openIssues): lib/sync/engine.ts's
  // startSync() runs once per page-load session and its first runCycle()
  // fires as soon as the account is signed in, before this profile (or its
  // seeded activities/rewards/locations) exists — that first cycle finds
  // `db.profiles` empty, pulls nothing, and reports "synced". Nothing
  // schedules another pull until the 60s poll interval, an outbox write, or
  // a tab visibility change, so the just-created profile's seed data would
  // otherwise sit unpulled for up to a minute. Tapping the sync mark's
  // "Sync now" is the one user-facing way to force a fresh cycle.
  //
  // A single tap isn't quite enough either: runCycle() is guarded by a
  // `cycleRunning` flag, so a tap that lands while the *other*, already-
  // in-flight (empty) cycle from startSync()'s own first run is still
  // finishing silently no-ops. Rather than trust the sheet's "Up to date"
  // label (which can reflect that no-op'd cycle), poll for the actual
  // seeded data — the Chips tab's Home/School locations — retrying "Sync
  // now" until it shows up.
  await gotoTab(page, 'chips');
  await expect
    .poll(
      async () => {
        const count = await page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio').count();
        if (count > 0) return count;
        const syncButton = page.getByRole('button', { name: /^Synced|^Sync pending|^Offline$|^Sync error$/ });
        await syncButton.click();
        const syncSheet = page.getByRole('dialog');
        const syncNow = syncSheet.getByRole('button', { name: 'Sync now', exact: true });
        await syncNow.click();
        // Wait for this cycle to actually finish (the button re-enables)
        // before closing, so this attempt's pull has a chance to land
        // before the next poll tick checks the location count.
        await expect(syncNow).toBeEnabled({ timeout: 5_000 }).catch(() => undefined);
        await syncSheet.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 5_000 }).catch(() => undefined);
        return 0;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0);
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
