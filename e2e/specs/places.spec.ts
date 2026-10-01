import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, signUp, snap, toast } from '../helpers';

test.describe.configure({ mode: 'serial' });

/**
 * Places: #16 (other places start empty), #26 (several places per activity or
 * reward), #29 (bulk "Set place" on the library lists), #17 (address search).
 *
 * The active place is switched from the Location radiogroup on Today (the same
 * control as on Chips, TodayScreen.tsx:256). Today's "Add activity" picker is
 * the place-filtered view of the activity list (Picker.tsx:39), so it is what
 * proves where an activity shows.
 *
 * Nominatim is never called for real: every request to it is answered by the
 * `page.route()` stub in beforeAll. Map tiles are stubbed too.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/**';
const TILES = 'https://*.tile.openstreetmap.org/**';
const CORS = { 'access-control-allow-origin': '*' };
// 1x1 transparent PNG, so Leaflet tiles never leave the machine.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const LONG_LABEL = '221B Baker Street, Marylebone, City of Westminster, London, Greater London, England, NW1 6XE, United Kingdom';
const HIT_LAT = 51.5237;
const HIT_LNG = -0.1585;

type NominatimMode = 'hits' | 'none' | 'error500' | 'abort';

test.describe('places', () => {
  let context: BrowserContext;
  let page: Page;
  let password: string;
  let mode: NominatimMode = 'hits';
  const nominatimQueries: string[] = [];

  test.beforeAll(async ({ browser }) => {
    // Service workers blocked so page.route() sees every request (a service
    // worker can answer a fetch before Playwright's interception does).
    context = await browser.newContext({ serviceWorkers: 'block' });
    page = await context.newPage();

    await page.route(NOMINATIM, async (route) => {
      nominatimQueries.push(new URL(route.request().url()).searchParams.get('q') ?? '');
      if (mode === 'abort') return route.abort('failed');
      if (mode === 'error500') return route.fulfill({ status: 500, headers: CORS, contentType: 'text/plain', body: 'boom' });
      const body = mode === 'none' ? [] : [{ display_name: LONG_LABEL, lat: String(HIT_LAT), lon: String(HIT_LNG) }];
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route(TILES, (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PIXEL }));

    ({ password } = await signUp(page, { name: 'Places Tester' }));
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ---- helpers -----------------------------------------------------------

  /** TodayScreen.tsx:256 / Segmented.tsx:37: radiogroup "Location", one radio per place. */
  async function setPlace(name: string): Promise<void> {
    const radio = page.getByRole('radiogroup', { name: 'Location' }).getByRole('radio', { name, exact: true });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
  }

  /** TodayScreen.tsx:307 (empty state) and :436 (floating plus) are both "Add activity". */
  async function openTodayPicker(): Promise<Locator> {
    await page.getByRole('button', { name: 'Add activity', exact: true }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // Picker.tsx:127 h3 "Activities". Its section holds only the activity tiles.
    await expect(sheet.getByRole('heading', { name: 'Activities', level: 3 })).toBeVisible();
    return sheet;
  }

  function activityTiles(sheet: Locator): Locator {
    // CSS :has() rather than Playwright's `has:` option, whose inner locator must be
    // relative to the outer element; a sheet-rooted one there matches nothing.
    // Picker.tsx:108-113 renders <section><h3>Activities</h3><div grid>…tiles…</div></section>.
    return sheet.locator('section:has(h3:text-is("Activities"))').getByRole('button');
  }

  /** Sheet.tsx:180/185: IconButton aria-label "Close". */
  async function closeSheet(sheet: Locator): Promise<void> {
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  /** Where the named row shows, straight from IndexedDB ('EVERY' = empty list = every place). Mirrors effectiveLocationIds. */
  async function placesOf(table: 'activities' | 'rewards', name: string): Promise<string[]> {
    return page.evaluate(
      async ({ table: t, name: n }) => {
        interface Scoped {
          name: string;
          deleted_at: number | null;
          location_id: string | null;
          location_ids?: string[] | null;
        }
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open('chipperly');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const read = (store: string) =>
          new Promise<unknown[]>((res, rej) => {
            const r = db.transaction(store).objectStore(store).getAll();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
        const rows = (await read(t)) as Scoped[];
        const locs = (await read('locations')) as { id: string; name: string }[];
        db.close();
        const row = rows.find((x) => x.name === n && x.deleted_at === null);
        if (!row) return ['<missing>'];
        const ids = row.location_ids;
        let effective: string[];
        if (ids == null) effective = row.location_id === null ? [] : [row.location_id];
        else {
          const mirror = ids.length === 1 ? (ids[0] as string) : null;
          effective = mirror === row.location_id ? ids : row.location_id === null ? [] : [row.location_id];
        }
        if (effective.length === 0) return ['EVERY'];
        return effective.map((id) => locs.find((l) => l.id === id)?.name ?? id).sort();
      },
      { table, name },
    );
  }

  async function locationRow(name: string): Promise<{ lat: number | null; lng: number | null; radius_m: number | null } | undefined> {
    return page.evaluate(async (n) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('chipperly');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const all = await new Promise<unknown[]>((res, rej) => {
        const r = db.transaction('locations').objectStore('locations').getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      db.close();
      const row = (all as { name: string; deleted_at: number | null; lat: number | null; lng: number | null; radius_m: number | null }[]).find(
        (x) => x.name === n && x.deleted_at === null,
      );
      return row ? { lat: row.lat, lng: row.lng, radius_m: row.radius_m } : undefined;
    }, name);
  }

  /** LibraryList.tsx:635 CheckCircle: aria-label "<name>, not checked". */
  async function tick(...names: string[]): Promise<void> {
    for (const name of names) await page.getByRole('checkbox', { name: `${name}, not checked`, exact: true }).first().click();
  }

  /** LibraryList.tsx:613 "Select". */
  async function startSelect(): Promise<void> {
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  }

  /** LibraryList.tsx:473: sheet title `Set places for N`. */
  async function openSetPlaces(n: number): Promise<Locator> {
    // LibraryList.tsx:603: the button's text is "Set place" (singular).
    await page.getByRole('button', { name: 'Set place', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Set places for ${n}` });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  function rewardSection(place: string): Locator {
    return page.locator('section', { has: page.getByRole('heading', { name: place, level: 2, exact: true }) });
  }

  function rewardRow(place: string, reward: string): Locator {
    return rewardSection(place).locator('button[class*="ListRow_main"]', { hasText: reward });
  }

  // ---- #16 ---------------------------------------------------------------

  test('#16 other places start empty: Home has the starter activities, School has none', async () => {
    await setPlace('Home');
    let sheet = await openTodayPicker();
    // Seeded activities are pinned to Home (apps/api/src/seed/seedProfile.ts: location_id homeId).
    await expect(activityTiles(sheet).filter({ hasText: 'Snack Time' }).first()).toBeVisible();
    await closeSheet(sheet);

    await setPlace('School');
    // Today's schedule for School is empty too: the Home starter plan is filtered out.
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toHaveCount(0);
    sheet = await openTodayPicker();
    await expect(activityTiles(sheet)).toHaveCount(0);
    await expectNoOverflow(page, '#16 picker at School');
    await snap(page, 'places-16-school-empty');
    await closeSheet(sheet);
    await setPlace('Home');
  });

  // ---- setup: a third place -----------------------------------------------

  test('Settings > Library > Locations: add a third place, Grandma', async () => {
    await gotoCaregiver(page, '/settings/library/locations/', password);
    await page.getByRole('button', { name: 'Add location', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add location' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill('Grandma');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Grandma' })).toBeVisible();
    await expectNoOverflow(page, 'library locations');
  });

  // ---- #26 ---------------------------------------------------------------

  test('#26 activity form: Save is blocked with nothing ticked, then saves two places', async () => {
    await gotoCaregiver(page, '/settings/library/activities/', password);
    await page.getByRole('button', { name: 'Add activity', exact: true }).first().click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Two-place task');

    // ActivityForm.tsx:503 FormRow label "Place (optional)"; default summary is "Every place".
    const placeRow = page.getByRole('button', { name: /^Place \(optional\)/ });
    await expect(placeRow).toContainText('Every place');
    await placeRow.click();

    // LocationMultiSelect.tsx:39-49: label wraps the checkbox, so the name carries the hint text.
    const every = page.getByRole('checkbox', { name: /^Every place/ });
    await expect(every).toBeChecked();
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();

    await every.uncheck();
    // LocationMultiSelect.tsx:71-72 role="alert": "Pick at least one place, or choose Every place. ..."
    await expect(page.getByText(/^Pick at least one place, or choose Every place/)).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(placeRow).toContainText('No place picked');
    await expectNoOverflow(page, '#26 activity form, nothing picked');
    await snap(page, 'places-26-nothing-picked');

    // LocationMultiSelect.tsx:56-67: one checkbox per place, named by the place.
    await page.getByRole('checkbox', { name: 'School', exact: true }).check();
    await expect(page.getByText(/^Pick at least one place/)).toHaveCount(0);
    await expect(save).toBeEnabled();
    // Unticking the only place brings the block back: still no silent "nowhere".
    await page.getByRole('checkbox', { name: 'School', exact: true }).uncheck();
    await expect(save).toBeDisabled();

    await page.getByRole('checkbox', { name: 'School', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Grandma', exact: true }).check();
    await expect(placeRow).toContainText('School, Grandma');
    await snap(page, 'places-26-two-places');
    await save.click();
    await page.waitForURL('**/settings/library/activities/**');

    await expect.poll(() => placesOf('activities', 'Two-place task')).toEqual(['Grandma', 'School']);
  });

  test('#26 activity form: "Every place" saves an empty list, which is not "no places"', async () => {
    await page.getByRole('button', { name: 'Add activity', exact: true }).first().click();
    await page.waitForURL('**/activity/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Anywhere task');
    // Left on the default "Every place": Save is enabled without opening the Place row.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/settings/library/activities/**');
    await expect.poll(() => placesOf('activities', 'Anywhere task')).toEqual(['EVERY']);
  });

  test('#26 the two-place activity shows at School and Grandma, not Home; the every-place one shows everywhere', async () => {
    await gotoCaregiver(page, '/today/', password);

    for (const [place, twoPlace] of [
      ['School', true],
      ['Grandma', true],
      ['Home', false],
    ] as const) {
      await setPlace(place);
      const sheet = await openTodayPicker();
      const tiles = activityTiles(sheet);
      // Picker.tsx:164 ActivityTile: aria-label is the activity name.
      await expect(tiles.filter({ hasText: 'Anywhere task' })).toHaveCount(1);
      await expect(tiles.filter({ hasText: 'Two-place task' })).toHaveCount(twoPlace ? 1 : 0);
      if (place === 'Grandma') {
        await expectNoOverflow(page, '#26 picker at Grandma');
        await snap(page, 'places-26-picker-grandma');
      }
      await closeSheet(sheet);
    }
  });

  test('#26 reward form: same rule, and the library groups it under each place it is offered in', async () => {
    await gotoCaregiver(page, '/settings/library/rewards/', password);
    await page.getByRole('button', { name: 'Add reward', exact: true }).first().click();
    await page.waitForURL('**/reward/edit/**');
    await page.getByLabel('Name', { exact: true }).fill('Two-place reward');

    // RewardForm.tsx:176 FormRow label "Where it is offered".
    const whereRow = page.getByRole('button', { name: /^Where it is offered/ });
    await expect(whereRow).toContainText('Every place');
    await whereRow.click();
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await page.getByRole('checkbox', { name: /^Every place/ }).uncheck();
    await expect(page.getByText(/^Pick at least one place, or choose Every place/)).toBeVisible();
    await expect(save).toBeDisabled();

    await page.getByRole('checkbox', { name: 'School', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Grandma', exact: true }).check();
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL('**/settings/library/rewards/**');

    // LibraryList.tsx:624: rewards are grouped by place, h2 per place; "Every place" for an empty list.
    await expect(rewardRow('School', 'Two-place reward')).toBeVisible();
    await expect(rewardRow('Grandma', 'Two-place reward')).toBeVisible();
    await expect(rewardRow('Every place', 'Two-place reward')).toHaveCount(0);
    await expect(rewardRow('Every place', 'Toy')).toBeVisible();
    await expectNoOverflow(page, '#26 rewards library grouped by place');
    await snap(page, 'places-26-rewards-grouped');
  });

  // ---- #29 ---------------------------------------------------------------

  test('#29 select mode: a checkbox per row, Select all / Select none, live count, actions need a selection', async () => {
    await gotoCaregiver(page, '/settings/library/activities/', password);
    const rows = page.locator('button[class*="ListRow_main"]');
    // count() does not wait: let the list render before counting it.
    await expect(rows.nth(2)).toBeVisible();
    const total = await rows.count();
    expect(total).toBeGreaterThan(2);

    await startSelect();
    // One checkbox per row (LibraryList.tsx:635), each "<name>, not checked".
    await expect(page.getByRole('checkbox', { name: /, not checked$/ })).toHaveCount(total);
    // Nothing selected: the two actions are disabled (LibraryList.tsx:602, 605).
    await expect(page.getByRole('button', { name: 'Set place', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.getByText(`${total} selected`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select none', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set place', exact: true })).toBeEnabled();
    await expectNoOverflow(page, '#29 select mode, all selected');
    await snap(page, 'places-29-select-all');

    await page.getByRole('button', { name: 'Select none', exact: true }).click();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();

    await tick('Snack Time');
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    // Tapping the row itself toggles it too (LibraryList.tsx:632).
    await rows.filter({ hasText: 'iPad Time' }).click();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();

    // LibraryList.tsx:608 "Done" leaves select mode and clears the selection.
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('#29 activities: "Add to their places" keeps what they have, "Replace" overwrites, Undo restores', async () => {
    // Two full select-and-apply rounds plus an undo. That is simply long on WebKit,
    // where every interaction costs more; slow() triples the budget rather than
    // pretending the work is quicker than it is.
    test.slow();
    // Both seeded rows start pinned to Home only.
    expect(await placesOf('activities', 'Snack Time')).toEqual(['Home']);
    expect(await placesOf('activities', 'iPad Time')).toEqual(['Home']);

    // ADD Grandma to two rows at once.
    await startSelect();
    await tick('Snack Time', 'iPad Time');
    let dialog = await openSetPlaces(2);
    // LocationPick (LibraryList.tsx:340-348): Segmented "What to do with the places", Add is the default.
    const mode = dialog.getByRole('radiogroup', { name: 'What to do with the places' });
    await expect(mode.getByRole('radio', { name: 'Add to their places', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/^Keeps the places each of the 2 already has and adds the ones you tick/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Tick at least one place', exact: true });
    await expect(confirm).toBeDisabled();
    await expectNoOverflow(page, '#29 set places sheet');
    await snap(page, 'places-29-sheet-add');

    await dialog.getByRole('checkbox', { name: 'Grandma, not checked', exact: true }).click();
    await dialog.getByRole('button', { name: 'Add 1 place', exact: true }).click();
    await expect(toast(page)).toContainText('2 now also in Grandma');
    await expect.poll(() => placesOf('activities', 'Snack Time')).toEqual(['Grandma', 'Home']);
    await expect.poll(() => placesOf('activities', 'iPad Time')).toEqual(['Grandma', 'Home']);
    // The bulk bar leaves select mode after an action (LibraryList.tsx:460).
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();

    // REPLACE with School: Home and Grandma are thrown away.
    await startSelect();
    await tick('Snack Time', 'iPad Time');
    dialog = await openSetPlaces(2);
    await dialog.getByRole('radio', { name: 'Replace their places', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'Replace their places', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/^Throws away the places each of the 2 has now/)).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'School, not checked', exact: true }).click();
    await snap(page, 'places-29-sheet-replace');
    await dialog.getByRole('button', { name: 'Replace with 1 place', exact: true }).click();
    await expect(toast(page)).toContainText('2 now only in School');
    // One quick check, then Undo. The toast dismisses after 5s (lib/toast), so two
    // IndexedDB polls in between leave nothing to click.
    await expect.poll(() => placesOf('activities', 'Snack Time')).toEqual(['School']);

    // UNDO puts the previous places back (LibraryList.tsx:444-458), not "every place".
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => placesOf('activities', 'Snack Time')).toEqual(['Grandma', 'Home']);
    await expect.poll(() => placesOf('activities', 'iPad Time')).toEqual(['Grandma', 'Home']);
  });

  test('#29 activities: "Show in every place", then Undo', async () => {
    await startSelect();
    await tick('Snack Time', 'iPad Time');
    const dialog = await openSetPlaces(2);
    await dialog.getByRole('button', { name: 'Show in every place', exact: true }).click();
    await expect(toast(page)).toContainText('2 now in every place');
    // The toast text is the evidence the write happened; polling before the Undo click
    // can outlast the 5s toast.
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => placesOf('activities', 'Snack Time')).toEqual(['Grandma', 'Home']);
    await expect.poll(() => placesOf('activities', 'iPad Time')).toEqual(['Grandma', 'Home']);
  });

  test('#29 activities: Delete sits behind a confirm, Cancel keeps them, Undo brings them back', async () => {
    // Two full select-and-apply rounds plus an undo. That is simply long on WebKit,
    // where every interaction costs more; slow() triples the budget rather than
    // pretending the work is quicker than it is.
    test.slow();
    await startSelect();
    await tick('Homework', 'School Time');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Sheet title "Delete selected", Confirm h3 "Delete 2 items?" (LibraryList.tsx:482, 494).
    const dialog = page.getByRole('dialog', { name: 'Delete selected' });
    await expect(dialog.getByRole('heading', { name: 'Delete 2 items?' })).toBeVisible();
    await expect(dialog.getByText('They disappear from every place. You can undo right after.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    // Cancelled: still there, still selected.
    expect(await placesOf('activities', 'Homework')).not.toEqual(['<missing>']);
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete selected' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    // Nothing at all between the toast and the Undo click. The toast dismisses after 5s
    // (lib/toast) and WebKit detaches it mid-click even after two fast assertions, so
    // "Deleted 2" is the evidence the delete happened and the rest is checked after.
    await expect(toast(page)).toContainText('Deleted 2');
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => placesOf('activities', 'Homework')).not.toEqual(['<missing>']);
    await expect.poll(() => placesOf('activities', 'School Time')).not.toEqual(['<missing>']);
  });

  test('#29 rewards: Add leaves an every-place reward everywhere, Replace moves it, Undo puts it back', async () => {
    // Two full select-and-apply rounds plus an undo. That is simply long on WebKit,
    // where every interaction costs more; slow() triples the budget rather than
    // pretending the work is quicker than it is.
    test.slow();
    await gotoCaregiver(page, '/settings/library/rewards/', password);
    await expect(rewardRow('Every place', 'Toy')).toBeVisible();
    await expect(rewardRow('Every place', 'Candy')).toBeVisible();

    // ADD School: rows already in every place stay in every place (places.ts mergePlaces).
    await startSelect();
    await tick('Toy', 'Candy');
    let dialog = await openSetPlaces(2);
    await dialog.getByRole('checkbox', { name: 'School, not checked', exact: true }).click();
    await dialog.getByRole('button', { name: 'Add 1 place', exact: true }).click();
    await expect(toast(page)).toContainText('2 now also in School');
    await expect(rewardRow('Every place', 'Toy')).toBeVisible();
    await expect(rewardRow('School', 'Toy')).toHaveCount(0);

    // REPLACE with School: they leave "Every place" and appear under School.
    await startSelect();
    await tick('Toy', 'Candy');
    dialog = await openSetPlaces(2);
    await dialog.getByRole('radio', { name: 'Replace their places', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'School, not checked', exact: true }).click();
    await dialog.getByRole('button', { name: 'Replace with 1 place', exact: true }).click();
    await expect(toast(page)).toContainText('2 now only in School');
    // UNDO immediately: nothing may sit between the toast and this click. The toast
    // dismisses after 5s (lib/toast) and WebKit detaches it mid-click, so the toast text
    // above is the evidence the replace happened and the state is checked afterwards.
    await toast(page).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(rewardRow('Every place', 'Toy')).toBeVisible();
    await expect(rewardRow('Every place', 'Candy')).toBeVisible();
    await expect(rewardRow('School', 'Toy')).toHaveCount(0);
    await expect.poll(() => placesOf('rewards', 'Toy')).toEqual(['EVERY']);
    await expectNoOverflow(page, '#29 rewards after undo');
    await snap(page, 'places-29-rewards-undone');
  });

  // ---- #17 (Nominatim stubbed) ---------------------------------------------

  async function openAddLocation(): Promise<Locator> {
    await gotoCaregiver(page, '/settings/library/locations/', password);
    await page.getByRole('button', { name: 'Add location', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add location' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async function searchFor(dialog: Locator, q: string): Promise<void> {
    // LibraryList.tsx:272 TextField label "Or type an address"; :279-281 Button "Search".
    await dialog.getByLabel('Or type an address', { exact: true }).fill(q);
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  }

  test('#17 a result can be picked, it sets the position, and Save stores it', async () => {
    mode = 'hits';
    nominatimQueries.length = 0;
    const dialog = await openAddLocation();
    await dialog.getByLabel('Name', { exact: true }).fill('Park');
    await searchFor(dialog, '221B Baker St');

    // LibraryList.tsx:289 role=group aria-label "Address matches"; each hit is a button named by its label.
    const hit = dialog.getByRole('group', { name: 'Address matches' }).getByRole('button', { name: LONG_LABEL, exact: true });
    await expect(hit).toBeVisible();
    expect(nominatimQueries).toEqual(['221B Baker St']);
    await expectNoOverflow(page, '#17 address matches');
    await snap(page, 'places-17-hits');

    await hit.click();
    // applyHit (LibraryList.tsx:217): the list closes and no message is shown.
    await expect(dialog.getByRole('group', { name: 'Address matches' })).toHaveCount(0);
    await expect(dialog.getByRole('status')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Park' })).toBeVisible();

    // Nominatim gives lat/lon as strings; the saved row holds numbers, radius defaults to 100 m.
    await expect.poll(() => locationRow('Park')).toEqual({ lat: HIT_LAT, lng: HIT_LNG, radius_m: 100 });
  });

  test('#17 no results shows the honest message and picks nothing', async () => {
    mode = 'none';
    const dialog = await openAddLocation();
    await searchFor(dialog, 'zzzz nowhere');
    // LibraryList.tsx:211, role="status".
    await expect(dialog.getByRole('status')).toHaveText('No match. Try a street and town, or drag the pin.');
    await expect(dialog.getByRole('group', { name: 'Address matches' })).toHaveCount(0);
    await expectNoOverflow(page, '#17 no match');
    await snap(page, 'places-17-no-match');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('#17 a failed search shows its message and never blocks saving the place', async () => {
    mode = 'error500';
    const dialog = await openAddLocation();
    await dialog.getByLabel('Name', { exact: true }).fill('Vet');
    await searchFor(dialog, 'Main St');
    // LibraryList.tsx:208.
    const failed = "Couldn't search just now. Try again, or use your current location or drag the pin.";
    await expect(dialog.getByRole('status')).toHaveText(failed);
    await expect(dialog.getByRole('group', { name: 'Address matches' })).toHaveCount(0);

    // A dropped connection (fetch rejects) reads the same, and the button is usable again.
    mode = 'abort';
    await searchFor(dialog, 'Main St again');
    await expect(dialog.getByRole('status')).toHaveText(failed);
    await expectNoOverflow(page, '#17 search failed');
    await snap(page, 'places-17-failed');

    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Vet' })).toBeVisible();
    // No position was set, and the place still saved.
    await expect.poll(() => locationRow('Vet')).toEqual({ lat: null, lng: null, radius_m: null });
  });

  test('#17 offline: its own message, and Save still works', async ({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit throws on setOffline navigation quirks (see e2e/README ipad-webkit notes)');
    const before = nominatimQueries.length;
    const dialog = await openAddLocation();
    await dialog.getByLabel('Name', { exact: true }).fill('Camp');
    try {
      await context.setOffline(true);
      await searchFor(dialog, 'Lake Road');
      // LibraryList.tsx:207.
      await expect(dialog.getByRole('status')).toHaveText(
        "You're offline, so address search isn't available. Use your current location or drag the pin instead.",
      );
      // searchAddress returns before fetching when navigator.onLine is false.
      expect(nominatimQueries.length).toBe(before);
      // Save WHILE still offline: this app is offline-first, so adding a place must
      // never need the network. Going back online first reloads the page and closes
      // the sheet, which is what made this flaky.
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('button[class*="ListRow_main"]', { hasText: 'Camp' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
