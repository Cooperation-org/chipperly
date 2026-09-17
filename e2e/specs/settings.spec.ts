import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('settings', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Settings Tester' });
    await page.goto('/settings/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S20 settings menu renders', async () => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    for (const name of [
      'Edit profile',
      /Lock this device to/,
      'Attitude history',
      'Share link',
      'Activities',
      'Rewards',
      'Locations',
      'Care team',
      'Switch profile',
      'Add profile',
      'Account',
      'Sync status',
      'Clear local data',
    ]) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    await expectNoOverflow(page, 'S20 settings');
    await snap(page, 's20-settings');
  });

  test('S25 library: activities, rewards, locations, delete with undo', async () => {
    await page.getByRole('button', { name: 'Activities', exact: true }).click();
    await page.waitForURL('**/settings/library/activities/');
    await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();
    await expectNoOverflow(page, 'S25 library activities');
    await snap(page, 's25-library-activities');

    const row = page.locator('button[class*="ListRow_main"]', { hasText: 'Wake Up' });
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: 'Delete Wake Up', exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(toast(page)).toContainText('Deleted Wake Up');
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Wake Up' })).toBeVisible();

    await page.goto('/settings/library/locations/');
    await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Home' })).toBeVisible();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'School' })).toBeVisible();

    await page.goto('/settings/');
  });

  test('S26/S27 care team: invite, accept from a fresh context', async () => {
    // BUG API accept-invite: POST /invites/:token/accept (and every other
    // no-body api.post/patch/delete call — resend/cancel invite, remove
    // member, delete account) sends `Content-Type: application/json` with
    // no body (lib/api/client.ts always sets that header; request() only
    // omits the `body` field, not the header). Fastify's default JSON body
    // parser rejects that with 400 "Body cannot be empty when content-type
    // is set to 'application/json'", so InviteAccept.tsx's accept() always
    // catches and shows "Couldn't accept the invite. Try again." This test
    // documents the real flow up to that point and is expected to fail
    // there until the client (or server) is fixed; see openIssues.
    test.fail(true, "BUG accounts: accept invite 400s, Content-Type: application/json with no body — see openIssues");

    // Always leave `page` back on /settings/ for the next test, whether or
    // not the known-broken accept step below throws.
    try {
      await page.getByRole('button', { name: 'Care team', exact: true }).click();
      await page.waitForURL('**/settings/care-team/');
      await expectNoOverflow(page, 'S26 care team');
      await snap(page, 's26-care-team');

      await page.getByRole('button', { name: 'Invite', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Invite' });
      await expect(sheet).toBeVisible();
      await expectNoOverflow(page, 'S27 invite');
      await snap(page, 's27-invite');

      const inviteEmail = `e2e-invitee-${Date.now()}@example.com`;
      await sheet.getByLabel('Email', { exact: true }).fill(inviteEmail);
      // Admin role skips the per-profile checklist and gets every profile,
      // which keeps the accept flow below simple (no profile picking).
      await sheet.getByRole('radiogroup', { name: 'Role' }).getByRole('radio', { name: 'Admin' }).click();
      await sheet.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByText(inviteEmail)).toBeVisible();

      const mail = await page.request.get('/api/testing/last-mail').then((r) => r.json());
      expect(mail?.to).toBe(inviteEmail);
      const match = /token=([\w-]+)/.exec(mail?.text ?? '');
      expect(match).not.toBeNull();
      const token = match?.[1] ?? '';

      const inviteeContext = await page.context().browser()!.newContext();
      try {
        const inviteePage = await inviteeContext.newPage();
        await inviteePage.goto(`/invite/?token=${token}`);
        await expect(inviteePage.getByText(/invited you to/)).toBeVisible();
        await expectNoOverflow(inviteePage, 'S33 accept invite');
        await snap(inviteePage, 's33-accept-invite');

        await inviteePage.getByRole('link', { name: 'Create account', exact: true }).click();
        await inviteePage.waitForURL('**/sign-up/');
        await inviteePage.getByLabel('Name', { exact: true }).fill('Invitee Caregiver');
        await inviteePage.getByLabel('Email', { exact: true }).fill(inviteEmail);
        await inviteePage.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
        await inviteePage.getByRole('button', { name: 'Create account', exact: true }).click();

        await inviteePage.waitForURL('**/invite/?token=**');
        await inviteePage.getByRole('button', { name: 'Accept invite', exact: true }).click();
        await inviteePage.waitForURL('**/today/', { timeout: 5_000 });
        await expect(inviteePage.getByText('Benny')).toBeVisible();
        await expectNoOverflow(inviteePage, 'accepted invite -> today');
      } finally {
        await inviteeContext.close();
      }
    } finally {
      await page.goto('/settings/');
    }
  });

  test('S28 share link: enable, copy, open from a fresh context', async () => {
    // BUG API sync/push: enabling the toggle upserts `profiles.share_token`
    // locally then pushes it through the outbox; that push is unreliable
    // shortly after profile creation. lib/clock.ts's `now()` offset is
    // learned from the HTTP `Date` response header, which only has
    // whole-second resolution, so it can under-shoot the true server time
    // by up to ~1s. The profile row's own `client_updated_at` was set
    // moments earlier from the server's precise `Date.now()`
    // (apps/api/src/routes/accounts.ts POST /accounts/:id/profiles), so a
    // share-toggle pushed soon after can compute a `client_updated_at` that
    // looks *older* than the stored row and gets rejected `reason: "stale"`
    // by routes/sync.ts's `applyUpsert` (seen once as a clean 200 rejection,
    // once as a 500 "Something went wrong" — same push, so likely the same
    // root cause hitting an unhandled edge case server-side too). Either
    // way `GET /api/share/:token` 404s because the token never lands. The
    // same "Sync error" outcome shows up for a schedule_items push too
    // (today.spec.ts "back online"), on a row that isn't fresh, so the
    // clock-skew theory above doesn't fully explain that case — the push
    // path likely has a broader, not yet pinned down, source of
    // intermittent 500s. See openIssues.
    test.fail(true, 'BUG sync: profiles push rejected/500s shortly after profile creation (clock-skew LWW) — see openIssues');

    const viewerContext = await page.context().browser()!.newContext();
    try {
      // Independent of the bug above: a token that was never issued.
      const viewerPage = await viewerContext.newPage();
      await viewerPage.goto('/share/?token=not-a-real-token');
      await expect(viewerPage.getByText(/isn.t active/)).toBeVisible();

      await page.getByRole('button', { name: 'Share link', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Share link' });
      await expect(sheet).toBeVisible();
      await expectNoOverflow(page, 'S28 share link');
      await snap(page, 's28-share-link');

      const toggle = sheet.getByRole('switch', { name: 'Share a read-only link', exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();

      const field = sheet.getByLabel('Share link', { exact: true });
      const link = await field.inputValue();
      const match = /token=([A-Za-z0-9]+)/.exec(link);
      expect(match).not.toBeNull();
      const token = match?.[1] ?? '';

      // The token is written locally and reaches the server via the outbox
      // sync; poll the public endpoint rather than assuming a fixed delay.
      await expect
        .poll(
          async () => {
            const res = await page.request.get(`/api/share/${token}`);
            return res.status();
          },
          { timeout: 20_000 },
        )
        .toBe(200);

      await viewerPage.goto(`/share/?token=${token}`);
      await expect(viewerPage.getByRole('heading', { name: 'Benny' })).toBeVisible();
      await expectNoOverflow(viewerPage, 'S34 share viewer');
      await snap(viewerPage, 's34-share-viewer');

      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    } finally {
      await viewerContext.close();
      await page.goto('/settings/');
    }
  });

  test('S30 account page renders', async () => {
    await page.goto('/settings/account/');
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expectNoOverflow(page, 'S30 account');
    await snap(page, 's30-account-settings');
    await page.goto('/settings/');
  });

  test('S31 sync status sheet opens', async () => {
    await page.getByRole('button', { name: 'Sync status', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Sync' });
    await expect(sheet).toBeVisible();
    // Minor content duplication (not tested as a bug here): opened with a
    // sheet title of "Sync" (components/settings/SettingsMenu.tsx), the
    // Sheet chrome's own "Sync" <h2> and SyncSheet's own "Sync" <h2>
    // (components/shell/SyncSheet.tsx) both render, so there are two.
    await expect(sheet.getByRole('heading', { name: 'Sync' }).first()).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Sync now', exact: true })).toBeVisible();
    await expectNoOverflow(page, 'S31 sync status');
    await snap(page, 's31-sync-status');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  });

  test('S21 profiles: add a second child and switch', async () => {
    await page.getByRole('button', { name: 'Add profile', exact: true }).click();
    await page.waitForURL('**/settings/profiles/');
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();
    await expectNoOverflow(page, 'S21 profiles');
    await snap(page, 's21-profiles');

    await page.getByRole('button', { name: 'Add child', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Add child' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Name', { exact: true }).fill('Ada');
    await sheet.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(sheet).toBeHidden();

    // Scoped to the profiles list: the TopBar profile switcher now also
    // reads "Ada" since creating a profile makes it the active one.
    const profileRows = page.locator('button[class*="ProfilesScreen_row"]');
    await expect(profileRows.filter({ hasText: 'Ada' })).toBeVisible();
    await profileRows.filter({ hasText: 'Benny' }).click();
    await expect(toast(page)).toContainText('Switched to Benny');
  });
});
