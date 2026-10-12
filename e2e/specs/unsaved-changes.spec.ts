import { test, expect, type Page } from '@playwright/test';
import { reloadCaregiver, signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** Local calendar date, as the app derives "today" (packages/shared helpers/date.ts). */
function isoDate(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

interface LocalState {
  /** Schedule items on `date` the server has confirmed (it stamps `version`; a pull brings it back). */
  saved: number;
  /** Schedule items on `date` that exist on this device only. */
  localOnly: number;
  outbox: number;
  parked: { reason: string; kind: string; table: string }[];
}

/** Reads the app's IndexedDB directly: what the device holds, and what the server has confirmed of it. */
function localState(page: Page, date: string): Promise<LocalState> {
  return page.evaluate(
    (day) =>
      new Promise<LocalState>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['schedule_items', 'outbox', 'outbox_parked'], 'readonly');
          const all = <T>(store: string): Promise<T[]> =>
            new Promise((res, rej) => {
              const req = tx.objectStore(store).getAll();
              req.onsuccess = () => res(req.result as T[]);
              req.onerror = () => rej(req.error);
            });
          Promise.all([
            all<{ date: string; version: number; deleted_at: number | null }>('schedule_items'),
            all<unknown>('outbox'),
            all<{ reason: string; kind: string; table: string }>('outbox_parked'),
          ]).then(([items, outbox, parked]) => {
            const onDay = items.filter((item) => item.date === day && item.deleted_at === null);
            idb.close();
            resolve({
              saved: onDay.filter((item) => item.version > 0).length,
              localOnly: onDay.filter((item) => item.version === 0).length,
              outbox: outbox.length,
              parked: parked.map((p) => ({ reason: p.reason, kind: p.kind, table: p.table })),
            });
          }, reject);
        };
      }),
    date,
  );
}

/** Writes rows straight into the app's IndexedDB, the way a bug or an older build would have left them. */
function putLocal(page: Page, store: string, rows: Record<string, unknown>[]): Promise<void> {
  return page.evaluate(
    ({ storeName, values }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction([storeName], 'readwrite');
          for (const value of values) tx.objectStore(storeName).put(value);
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { storeName: store, values: rows },
  );
}

function firstItem(page: Page, date: string): Promise<Record<string, unknown>> {
  return page.evaluate(
    (day) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(['schedule_items'], 'readonly').objectStore('schedule_items').getAll();
          req.onsuccess = () => {
            open.result.close();
            const found = (req.result as Record<string, unknown>[]).find((item) => item.date === day);
            if (found) resolve(found);
            else reject(new Error(`no schedule item on ${day}`));
          };
          req.onerror = () => reject(req.error);
        };
      }),
    date,
  );
}

// What happened to Benny (Oct 2026): a phone left in the child view built
// each new day while locked, the server refused those rows, and the app
// dropped them. These run the real app against the real API.
const NOT_SAVED = '1 change made on this device could not be saved to your account.';

test.describe('changes made on a device are saved or said out loud', () => {
  let page: Page;
  let password = '';
  const today = isoDate(new Date());
  const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const tomorrowNoon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrowNoon.setHours(12, 0, 0, 0);
  const tomorrow = isoDate(tomorrowNoon);

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Overnight Tester' }));
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await expect.poll(async () => (await localState(page, today)).outbox, { timeout: 30_000 }).toBe(0);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('a row the server never got is sent the next time the app opens', async () => {
    // Left behind the way the old build left Benny's days: on the device, with nothing queued to send it.
    const template = await firstItem(page, today);
    const lostId = crypto.randomUUID();
    await putLocal(page, 'schedule_items', [{ ...template, id: lostId, date: yesterday, source: 'manual', version: 0, position: 0 }]);
    expect(await localState(page, yesterday)).toMatchObject({ saved: 0, localOnly: 1, outbox: 0 });

    await page.reload();
    await expect.poll(async () => (await localState(page, yesterday)).saved, { timeout: 30_000 }).toBe(1);
    expect(await localState(page, yesterday)).toMatchObject({ localOnly: 0, outbox: 0, parked: [] });
  });

  test('a change the server will not take is kept, and the caregiver is told', async () => {
    const template = await firstItem(page, today);
    const brokenId = crypto.randomUUID();
    // `position` must be a number: the server answers `invalid`, and would every time.
    const broken = { ...template, id: brokenId, date: yesterday, source: 'manual', version: 0, position: 'first' };
    await putLocal(page, 'schedule_items', [broken]);
    await putLocal(page, 'outbox', [{ id: brokenId, table: 'schedule_items', op: 'upsert', row: broken, client_updated_at: Date.now(), attempts: 0, created_at: Date.now() }]);

    await reloadCaregiver(page, password);
    await expect(page.getByRole('alert').filter({ hasText: NOT_SAVED })).toBeVisible({ timeout: 30_000 });
    const state = await localState(page, yesterday);
    expect(state.outbox).toBe(0);
    expect(state.parked).toEqual([{ reason: 'invalid', kind: 'dead', table: 'schedule_items' }]);

    // The sheet says the same and offers a way out; the good rows around it still sync.
    await page.getByRole('button', { name: 'See what to do', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Sync' });
    await expect(sheet.getByText('1 change could not be saved to your account.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Save a copy to this device', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Clearing the device now would lose it, so the question says so.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /Clear local data/ }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Clear local data' });
    await expect(confirm.getByText(/1 change made on this device has not been saved to your account/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('a phone left locked to the child view saves the next day it builds', async () => {
    await page.getByRole('button', { name: /'s view$/ }).click();
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    expect((await localState(page, tomorrow)).saved).toBe(0);

    // A phone that lives in the child view never shows the caregiver screens: its caregiver hears on the unlock screen.
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    const unlock = page.getByRole('dialog', { name: 'Unlock' });
    await expect(unlock.getByRole('alert').filter({ hasText: NOT_SAVED })).toBeVisible();
    await unlock.getByRole('button', { name: 'Cancel unlock', exact: true }).click();

    // The next day, on a phone nobody unlocked in between.
    await page.clock.setFixedTime(tomorrowNoon);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible({ timeout: 30_000 });

    await expect.poll(async () => (await localState(page, tomorrow)).saved, { timeout: 30_000 }).toBeGreaterThan(0);
    const state = await localState(page, tomorrow);
    expect(state.localOnly).toBe(0);
    expect(state.outbox).toBe(0);
    // Only the broken row from the test above is still held back; the new day is not.
    expect(state.parked).toEqual([{ reason: 'invalid', kind: 'dead', table: 'schedule_items' }]);
  });
});
