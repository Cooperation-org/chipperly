import { expect, test, type Page } from '@playwright/test';
import { gotoTab, signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

// 300x300 solid-color PNG, generated once with sharp
// (`sharp({ create: { width: 300, height: 300, ... } }).png()`) and
// hardcoded here so the spec has no runtime dependency on apps/api's
// node_modules.
const PNG_300_BASE64 =
  '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';

const PNG_300_BUFFER = Buffer.from(PNG_300_BASE64, 'base64');
// Self-check: this literal is hand-transcribed and has silently gone
// corrupt before (same decoded length, wrong bytes, invisible everywhere
// except a strict browser PNG decoder) — fail loudly here instead of via a
// confusing "source image could not be decoded" deep inside a test.
if (PNG_300_BUFFER.length !== 2022 || PNG_300_BUFFER.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  throw new Error('PNG_300_BASE64 in photo-upload.spec.ts looks corrupted; regenerate it with sharp and re-paste exactly.');
}

function pngFile(name: string) {
  return { name, mimeType: 'image/png', buffer: PNG_300_BUFFER };
}

/**
 * Reads a field straight out of Dexie's IndexedDB store rather than the
 * client's `db` module (not reachable from Playwright's page.evaluate),
 * since it's the only way to learn which media id a synced row actually
 * references once its edit form has closed. Matches by a field (name is
 * unique enough here) rather than id: a new activity's id is generated
 * client-side inside saveActivity and never appears in the URL.
 */
async function readRowField(
  page: Page,
  table: string,
  matchField: string,
  matchValue: string,
  field: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ table, matchField, matchValue, field }) => {
      return new Promise((resolve, reject) => {
        const openReq = indexedDB.open('chipperly');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const tx = openReq.result.transaction(table, 'readonly');
          const cursorReq = tx.objectStore(table).openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return resolve(null);
            const row = cursor.value as Record<string, unknown>;
            if (row[matchField] === matchValue) return resolve(row[field] ?? null);
            cursor.continue();
          };
          cursorReq.onerror = () => reject(cursorReq.error);
        };
      });
    },
    { table, matchField, matchValue, field },
  );
}

test.describe('photo upload', () => {
  let page: Page;
  let activityPhotoId: unknown;
  let avatarPhotoId: unknown;
  let rewardPhotoId: unknown;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Photo Tester' });
  });

  test.afterAll(async () => {
    // Guarded: the webkit skip above is fixture-conditional, so beforeAll
    // (and the `page` it creates) doesn't run at all when every test in
    // this describe ends up skipped.
    await page?.close();
  });

  test('activity picture: choose Photo, save, Today shows it, sync completes', async () => {
    // The starter plan materializes async on mount; wait for it so the
    // floating "Add activity" button is the only match (not still
    // ambiguous with the empty state's button of the same name).
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add activity', exact: true }).click();
    const addSheet = page.getByRole('dialog');
    await addSheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/activity/edit/**');

    await page.getByLabel('Name', { exact: true }).fill('E2E Photo Activity');

    await page.getByRole('button', { name: /^Picture/ }).click();
    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    // Two hidden file inputs share the row (Photo, Camera); Camera's has
    // `capture="environment"` (PicturePicker.tsx), so this is unambiguous.
    await page.locator('input[type="file"]:not([capture])').setInputFiles(pngFile('activity.png'));

    // The picker's own preview and the still-visible FormRow summary tile
    // both render a same-alt <img> once a photo is chosen; scope to the
    // open panel so this stays a single match.
    const panelImg = page.locator('div[class*="FormRow_panel"] img[alt="E2E Photo Activity"]');
    await expect(panelImg).toBeVisible();
    await expect(panelImg).toHaveAttribute('src', /^blob:|\/api\/media\//);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/today/');

    // The photo lives in the row's tap button (ListRow's tile slot), not
    // inside the CheckCircle checkbox, which is a sibling trailing control.
    const todayRowButton = page.locator('button[class*="ListRow_main"]', { hasText: 'E2E Photo Activity' });
    await expect(todayRowButton.locator('img')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 20_000 });

    activityPhotoId = await readRowField(page, 'activities', 'name', 'E2E Photo Activity', 'photo_id');
    expect(activityPhotoId, 'activity row has a photo_id once saved').toBeTruthy();
  });

  test('reward picture via Chips > Working for > Create new: choose Photo, save, sync completes', async () => {
    await gotoTab(page, 'chips');
    await page.getByRole('button', { name: /Working for/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.waitForURL('**/reward/edit/**');

    await page.getByLabel('Name', { exact: true }).fill('E2E Photo Reward');

    await page.getByRole('button', { name: /^Picture/ }).click();
    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    await page.locator('input[type="file"]:not([capture])').setInputFiles(pngFile('reward.png'));

    const panelImg = page.locator('div[class*="FormRow_panel"] img[alt="E2E Photo Reward"]');
    await expect(panelImg).toBeVisible();
    await expect(panelImg).toHaveAttribute('src', /^blob:|\/api\/media\//);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/chips/');

    // The photo lives in the "Working for" card (ChipsScreen.tsx), which
    // picks it up via useWorkingFor's live query the moment the reward saves.
    const workingForButton = page.getByRole('button', { name: /^Working for/ });
    await expect(workingForButton).toContainText('E2E Photo Reward');
    await expect(workingForButton.locator('img')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 20_000 });

    rewardPhotoId = await readRowField(page, 'rewards', 'name', 'E2E Photo Reward', 'photo_id');
    expect(rewardPhotoId, 'reward row has a photo_id once saved').toBeTruthy();
  });

  test('profile avatar photo via Settings > Edit profile: choose Photo, save, sync completes', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    // Not `exact: true`: the row's accessible name is "Benny Edit profile"
    // (its tile is a Picture with an aria-label, per a11y-and-layout.spec.ts).
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    const profileId = new URL(page.url()).searchParams.get('id') ?? '';

    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    await page.locator('input[type="file"]:not([capture])').setInputFiles(pngFile('avatar.png'));

    const avatarImg = page.locator('img[alt="Benny"]');
    await expect(avatarImg).toBeVisible();
    await expect(avatarImg).toHaveAttribute('src', /^blob:|\/api\/media\//);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/');
    // Settings renders the profile picture twice (the header and the "Edit
    // profile" row's own tile); either is enough proof the photo saved.
    await expect(page.locator('img[alt="Benny"]').first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'Synced', exact: true })).toBeVisible({ timeout: 20_000 });

    avatarPhotoId = await readRowField(page, 'profiles', 'id', profileId, 'avatar_photo_id');
    expect(avatarPhotoId, 'profile row has an avatar_photo_id once saved').toBeTruthy();
  });

  // POST /media (apps/api/src/routes/media.ts) now honours the client's `media_id` multipart
  // field as the stored row's id (uploadPending() in apps/web/lib/media/upload.ts sends it
  // before the file part), so the id a synced record references (`photo_id` /
  // `avatar_photo_id`, assigned client-side by pickAndStoreImage before the upload even
  // starts) matches the media row the server holds, for any client that doesn't already have
  // the original local blob (another caregiver device, or this one after its IndexedDB cache
  // is cleared).
  test('the id an activity photo actually references resolves via the API', async () => {
    await expect
      .poll(async () => (await page.request.get(`/api/media/${activityPhotoId}`)).status(), { timeout: 20_000 })
      .toBe(200);
    const res = await page.request.get(`/api/media/${activityPhotoId}`);
    expect(res.headers()['content-type']).toBe('image/webp');
  });

  test('the id a profile avatar photo actually references resolves via the API', async () => {
    await expect
      .poll(async () => (await page.request.get(`/api/media/${avatarPhotoId}`)).status(), { timeout: 20_000 })
      .toBe(200);
    const res = await page.request.get(`/api/media/${avatarPhotoId}`);
    expect(res.headers()['content-type']).toBe('image/webp');
  });

  test('the id a reward photo actually references resolves via the API', async () => {
    await expect
      .poll(async () => (await page.request.get(`/api/media/${rewardPhotoId}`)).status(), { timeout: 20_000 })
      .toBe(200);
    const res = await page.request.get(`/api/media/${rewardPhotoId}`);
    expect(res.headers()['content-type']).toBe('image/webp');
  });
});
