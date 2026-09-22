import { expect, test, type Page } from '@playwright/test';
import { gotoTab, reloadCaregiverPin, setCaregiverPin, signUp, unlockPinIfBounced } from '../helpers';

/**
 * The full offline-first loop the review asked for: sign up, add an item,
 * let it sync, then go offline for a fresh reload (not just an in-session
 * offline write like today.spec.ts's check-off test) and confirm the app
 * still boots from the service worker's precache, still lets you work, and
 * still catches up once the connection returns.
 */
test.describe.configure({ mode: 'serial' });

const PIN = '3690';

test.describe('offline start', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Offline Tester' });
    // The offline reload test below needs to unlock without a network call
    // (UnlockOverlay's password path signs in over /auth/login); set while
    // still online so the PIN hash is cached before it's needed.
    await setCaregiverPin(page, PIN);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('add an activity and let it sync', async () => {
    // The starter plan materializes async on mount; wait for it so the
    // floating "Add activity" button is the only match (not still
    // ambiguous with the empty state's button of the same name).
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('E2E Offline Item');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');

    await expect(page.getByRole('checkbox', { name: /^E2E Offline Item,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('go offline', async () => {
    // The service worker precaches on install, which finishes before it can
    // ever control a page (`navigator.serviceWorker.ready` only resolves
    // once one does) — so this is enough of a guarantee that the reload in
    // the next test will be served from cache, not the network.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.context().setOffline(true);
  });

  test('reload offline: service worker serves the app, item and state survive', async ({ browserName }) => {
    // reload()/goto() while the context is offline throws "WebKit
    // encountered an internal error" at the driver level on this WebKit
    // build — reproduces with no app or service worker involved at all, so
    // it's a Playwright/WebKit test problem, not an app bug. Everything
    // else in this describe still runs genuinely offline on webkit; only
    // the reload-specific assertions below are skipped for it.
    test.skip(browserName === 'webkit', 'WebKit: reload()/goto() while offline throws "WebKit encountered an internal error" at the driver level (repros with no app involved) — test problem, not an app bug.');
    await reloadCaregiverPin(page, PIN);

    const checkbox = page.getByRole('checkbox', { name: /^E2E Offline Item,/ });
    await expect(checkbox).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offline', exact: true })).toBeVisible();
  });

  test('check an item off while offline', async () => {
    const checkbox = page.getByRole('checkbox', { name: /^E2E Offline Item,/ });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  test('navigate to /chips/ and back while offline', async ({ browserName }) => {
    // Same WebKit-offline driver issue as the reload test above:
    // waitForURL (which gotoTab uses) throws "WebKit encountered an
    // internal error" while the context is offline, independent of
    // whether the navigation is client-side — test problem, not an app bug.
    test.skip(browserName === 'webkit', 'WebKit: waitForURL() while offline throws "WebKit encountered an internal error" at the driver level — test problem, not an app bug.');
    await gotoTab(page, 'chips');
    await expect(page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio').first()).toBeVisible();
    await gotoTab(page, 'today');
    await expect(page.getByRole('checkbox', { name: /^E2E Offline Item,/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('back online: Sync now catches up', async () => {
    await page.context().setOffline(false);

    // The offline reload above can leave the page's original top-level
    // navigation request still held by the browser until connectivity
    // returns; it completes late, re-running session.ts's bootstrap (parent_
    // mode's full-navigation reset) and bouncing to /child/ a moment after
    // the page already looked fine. Give it a beat, then unlock again if so.
    await page.waitForTimeout(1500);
    await unlockPinIfBounced(page, '/today/', PIN);

    const syncButton = page.getByRole('button', { name: /^Synced|^Sync pending|^Offline$|^Sync error$/ });
    await syncButton.click();
    const sheet = page.getByRole('dialog', { name: 'Sync' });
    await sheet.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect.poll(() => sheet.getByText(/Up to date/).isVisible(), { timeout: 20_000 }).toBe(true);
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible();
  });
});
