import { test, expect, type Page } from '@playwright/test';
import { signUp } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

function isoDate(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

type Row = Record<string, unknown> & { id: string; profile_id: string; version: number; deleted_at: number | null };

/** Reads one store of the app's IndexedDB. */
function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('chipperly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction([name], 'readonly').objectStore(name).getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as T[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );
}

/** Writes rows straight into the app's IndexedDB, as a child-mode action would have left them. */
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

async function accessToken(page: Page): Promise<string> {
  const kv = await readStore<{ key: string; value: { access_token: string } | null }>(page, 'kv');
  const token = kv.find((entry) => entry.key === 'auth_tokens')?.value?.access_token;
  if (!token) throw new Error('no access token on this device');
  return token;
}

function scheduleItems(page: Page): Promise<Row[]> {
  return readStore<Row>(page, 'schedule_items');
}

// Sync asks before it overwrites a change made on this device, and never for
// an addition. A phone locked to the child view is the case that matters: its
// child cannot be asked anything.
test.describe('sync asks about conflicts, not about additions', () => {
  let page: Page;
  let password = '';
  let email = '';
  const today = isoDate(new Date());
  const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const addedId = crypto.randomUUID();
  let ids: [string, string] = ['', ''];
  let profileId = '';
  let mine = 0;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ email, password } = await signUp(page, { name: 'Conflict Tester' }));
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await expect.poll(async () => (await readStore(page, 'outbox')).length, { timeout: 30_000 }).toBe(0);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('a locked phone sends an addition at once and holds back a conflict, quietly', async ({ context }) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: /'s view$/ }).click();
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();

    const synced = (await scheduleItems(page)).filter((item) => item.date === today && item.version > 0 && item.deleted_at === null);
    expect(synced.length).toBeGreaterThanOrEqual(2);
    const [first, second] = synced.sort((a, b) => a.id.localeCompare(b.id)) as [Row, Row];
    // Sorted by id, the order the sync sheet lists them in.
    ids = [first.id, second.id];
    profileId = first.profile_id;

    // Off the network, the child ticks two items done (a change to existing rows) and logs a mood (a new row).
    // Meanwhile a caregiver on another phone moves the same two items to a new time.
    await context.setOffline(true);
    mine = Date.now();
    const done = [first, second].map((row) => ({ ...row, completed_at: mine, completed_by: row.updated_by, client_updated_at: mine }));
    const added = { id: addedId, profile_id: profileId, version: 0, client_updated_at: mine, updated_by: first.updated_by, deleted_at: null, date: today, delta: 1, level_after: 1, created_at: mine, created_by: first.updated_by };
    const queue = [...done.map((row) => ({ ...row, table: 'schedule_items' })), { ...added, table: 'mood_events' }].map(({ table, ...row }) => ({
      id: row.id,
      table,
      op: 'upsert',
      row,
      client_updated_at: mine,
      attempts: 0,
      created_at: mine,
    }));
    await putLocal(page, 'schedule_items', done);
    await putLocal(page, 'mood_events', [added]);
    await putLocal(page, 'outbox', queue);

    // The locked phone's own session cannot make the caregiver's change, so the caregiver signs in fresh.
    const login = await page.request.post('/api/auth/login', { data: { email, password } });
    const caregiverToken = ((await login.json()) as { access_token: string }).access_token;
    const push = await page.request.post('/api/sync/push', {
      headers: { Authorization: `Bearer ${caregiverToken}` },
      data: {
        profile_id: profileId,
        mutations: [first, second].map((row) => ({
          table: 'schedule_items',
          id: row.id,
          op: 'upsert',
          row: { ...row, start_time: '09:45', client_updated_at: mine + 60_000 },
          client_updated_at: mine + 60_000,
        })),
      },
    });
    expect(push.ok()).toBe(true);

    await context.setOffline(false);
    await page.reload();

    // The addition is on the account without anyone being asked.
    await expect
      .poll(async () => (await readStore<Row>(page, 'mood_events')).find((item) => item.id === addedId)?.version ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(0);

    // The two conflicts are set aside, this device's rows are untouched, and nothing is queued for them.
    await expect.poll(async () => (await readStore(page, 'sync_conflicts')).length, { timeout: 30_000 }).toBe(2);
    const rows = await scheduleItems(page);
    expect(rows.find((item) => item.id === ids[0])?.completed_at).toBe(mine);
    expect(rows.find((item) => item.id === ids[1])?.completed_at).toBe(mine);
    expect(await readStore(page, 'outbox')).toHaveLength(0);

    // The child's screen says nothing about it.
    await expect(page.getByRole('alert').filter({ hasText: /differ|account/ })).toHaveCount(0);
  });

  test('the caregiver sees both and keeps one each way', async () => {
    await page.getByRole('button', { name: 'Team unlock', exact: true }).click();
    const unlock = page.getByRole('dialog', { name: 'Unlock' });
    await expect(unlock.getByRole('alert').filter({ hasText: '2 changes on this device differ from your account.' })).toBeVisible();
    await enterPin(page, '1234');
    await page.waitForURL('**/today/**');

    await page.getByRole('button', { name: 'See what to do', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Sync' });
    await expect(sheet.getByText('2 changes differ between this device and your account.')).toBeVisible();
    await expect(sheet.getByText(/^start_time: this device /)).toHaveCount(2);

    const items = sheet.getByRole('listitem');
    await items.nth(0).getByRole('button', { name: /^Keep this device/ }).click();
    await items.nth(1).getByRole('button', { name: /^Use the account/ }).click();
    await sheet.getByRole('button', { name: 'Apply my choices', exact: true }).click();

    await expect.poll(async () => (await readStore(page, 'sync_conflicts')).length, { timeout: 30_000 }).toBe(0);
    await expect
      .poll(async () => (await scheduleItems(page)).find((item) => item.id === ids[0])?.version ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const rows = await scheduleItems(page);
    expect(rows.find((item) => item.id === ids[0])?.completed_at).toBe(mine);
    expect(rows.find((item) => item.id === ids[1])?.start_time).toBe('09:45');
    expect(rows.find((item) => item.id === ids[1])?.completed_at).toBeNull();
    await expect.poll(async () => (await readStore(page, 'outbox')).length, { timeout: 30_000 }).toBe(0);

    // The account holds this device's choice for the first row and its own copy of the second.
    const pulled = await page.request.get(`/api/sync/pull?profile_id=${profileId}&since=0`, {
      headers: { Authorization: `Bearer ${await accessToken(page)}` },
    });
    const onAccount = ((await pulled.json()) as { changes: { schedule_items: Row[] } }).changes.schedule_items;
    expect(onAccount.find((item) => item.id === ids[0])?.completed_at).toBe(mine);
    expect(onAccount.find((item) => item.id === ids[1])?.start_time).toBe('09:45');
    expect(onAccount.find((item) => item.id === ids[1])?.completed_at).toBeNull();
  });
});
