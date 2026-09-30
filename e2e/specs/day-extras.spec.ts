import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoCaregiver, gotoTab, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A real 300x300 solid-colour PNG built at load time, so there is no hand-pasted literal to corrupt. */
function solidPng(width = 300, height = 300): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x4c)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

/** Settings > "{name}'s view" (first open asks for a PIN twice). Returns nothing; callers use the dialog. */
async function openViewSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings/');
  // LockSheet.tsx / settings row: dialog and row are both named "<name>'s view".
  await page.getByRole('button', { name: /'s view$/ }).click();
  await expect(page.getByRole('dialog', { name: /'s view$/ })).toBeVisible();
}

// ---------------------------------------------------------------------------
// 7. Unchecking the routine returns to the state before check-all
// ---------------------------------------------------------------------------

async function createRoutine(page: Page, name: string, steps: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Add activity', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create new', exact: true }).click();
  await page.waitForURL('**/activity/edit/**');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: /^Steps/ }).click();
  for (let i = 0; i < steps.length; i += 1) {
    await page.getByRole('button', { name: 'Type a new step', exact: true }).click();
    await page.getByLabel(`Step ${i + 1}`, { exact: true }).fill(steps[i] as string);
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL('**/today/');
}

test.describe('7: uncheck the routine restores the pre-check-all state', () => {
  let page: Page;
  const A = 'Check Routine A';
  const B = 'Check Routine B';
  const stepsA = ['Alpha one', 'Alpha two', 'Alpha three'];
  const stepsB = ['Bravo one', 'Bravo two', 'Bravo three'];

  // CheckCircle.tsx:26 -> aria-label `${name}, checked|not checked`, role="checkbox".
  const box = (name: string) => page.getByRole('checkbox', { name: new RegExp(`^${name},`) });
  const expectState = async (name: string, checked: boolean) =>
    expect(box(name)).toHaveAttribute('aria-checked', String(checked));

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Extras Seven' });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
    await createRoutine(page, A, stepsA);
    await createRoutine(page, B, stepsB);
    await expect(box(A)).toBeVisible();
    await expect(box(B)).toBeVisible();
    // TodayScreen.tsx:392 -> `Expand ${activity.name} steps`.
    await page.getByRole('button', { name: `Expand ${A} steps`, exact: true }).click();
    await page.getByRole('button', { name: `Expand ${B} steps`, exact: true }).click();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('one step done, check the routine, uncheck it: only that step stays done', async () => {
    await box('Alpha one').click();
    await expectState('Alpha one', true);
    await expectState('Alpha two', false);
    await expectState(A, false);

    // setCompleted(done) snapshots {scope:null, ids:[Alpha one]} then completes every step.
    await box(A).click();
    await expectState(A, true);
    for (const s of stepsA) await expectState(s, true);
    await expectNoOverflow(page, 'S6 routine fully checked');
    await snap(page, 'extras-routine-all-checked');

    // Uncheck: restoredStepIds(steps, [Alpha one]) -> only Alpha one survives.
    await box(A).click();
    await expectState(A, false);
    await expectState('Alpha one', true);
    await expectState('Alpha two', false);
    await expectState('Alpha three', false);
    await snap(page, 'extras-routine-restored');
  });

  test('every step done first (routine auto-checks): unchecking the routine clears them all', async () => {
    for (const s of stepsB) await box(s).click();
    // Completing the last step completes the routine (allStepsComplete in setStepCompleted).
    await expectState(B, true);
    for (const s of stepsB) await expectState(s, true);

    // Ticking a step on its own cleared any snapshot, so there is nothing to restore: all clear.
    await box(B).click();
    await expectState(B, false);
    for (const s of stepsB) await expectState(s, false);
  });

  test('check-all from zero, then uncheck: back to zero', async () => {
    // Routine B is fully clear now; check-all snapshots an empty list.
    await box(B).click();
    await expectState(B, true);
    for (const s of stepsB) await expectState(s, true);
    await box(B).click();
    await expectState(B, false);
    for (const s of stepsB) await expectState(s, false);
  });
});

// ---------------------------------------------------------------------------
// 5. A picture on the day note
// ---------------------------------------------------------------------------

test.describe('5: day note with a photo', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Extras Five' });
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('a picture with no words saves (it used to delete the note)', async () => {
    // DayNote.tsx:63 -> aria-label `Add a note for ${dayName}`.
    await page.getByRole('button', { name: 'Add a note for today', exact: true }).click();
    // DayNote.tsx:25 sheet title `Note for ${childName}`.
    const sheet = page.getByRole('dialog', { name: 'Note for Benny' });
    await expect(sheet).toBeVisible();
    // DayNoteSheet.tsx:71: the only file input; hidden, so setInputFiles rather than a picker.
    await sheet.locator('input[type="file"]').setInputFiles({ name: 'note.png', mimeType: 'image/png', buffer: solidPng() });

    // DayNoteSheet.tsx:63 button flips to "Change photo" once photoId is set; DayNote.tsx:38 alt fallback.
    await expect(sheet.getByRole('button', { name: 'Change photo', exact: true })).toBeVisible();
    const preview = sheet.getByRole('img', { name: 'Picture for the day' });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('src', /^blob:|\/api\/media\//);

    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toBeHidden();

    // The note row survived with no text: label, picture, edit button.
    await expect(page.getByText('Note for Benny, today', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Picture for the day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit note for Benny, today', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a note for today', exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'S6 today with picture-only note');
    await snap(page, 'extras-note-photo-only');
  });

  test('add words to the same note: the picture stays, its alt becomes the text', async () => {
    await page.getByRole('button', { name: 'Edit note for Benny, today', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Note for Benny' });
    await expect(sheet).toBeVisible();
    // Reopened with the saved picture already in it.
    await expect(sheet.getByRole('button', { name: 'Change photo', exact: true })).toBeVisible();
    await sheet.getByLabel('Note for Benny, today', { exact: true }).fill('Bring the swimming bag.');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText('Bring the swimming bag.', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Bring the swimming bag.' })).toBeVisible();
  });

  test('the child sees the photo in the Today band', async () => {
    await openViewSheet(page);
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: /^Lock to / }).click();
    await page.waitForURL('**/child/');

    // DayBand.tsx:24 aria-label="Today"; DayNotePhoto alt is the note text.
    const band = page.getByRole('region', { name: 'Today' });
    await expect(band.getByText('Bring the swimming bag.', { exact: true })).toBeVisible();
    const photo = band.getByRole('img', { name: 'Bring the swimming bag.' });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', /^blob:|\/api\/media\//);
    await expectNoOverflow(page, 'S32 child band with note photo');
    await snap(page, 'extras-child-band-photo');
  });
});

// ---------------------------------------------------------------------------
// 22 + 23. First-Then readiness, and the voice clip controls
// ---------------------------------------------------------------------------

const MSG_BOTH = 'First-Then needs setting up first. Pick what comes first and the reward that comes after.';
const MSG_THEN_ONLY = 'First-Then needs setting up first. Pick the reward that comes after.';

test.describe('22 + 23: First-Then setup and voice clips', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Extras First' }));
    await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('22: Settings blocks both First-Then switches until a First and a Then are picked', async () => {
    await openViewSheet(page);
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    await enterPin(page, '1234');
    await expect(sheet.getByText('Enter it again')).toBeVisible();
    await enterPin(page, '1234');

    // LockSheet.tsx:199-203 and :221, Switch.tsx role="switch" aria-label.
    const only = sheet.getByRole('switch', { name: 'Only show First-Then, full page' });
    // exact: "Show First-Then" also substring-matches "Only show First-Then, full page".
    const show = sheet.getByRole('switch', { name: 'Show First-Then', exact: true });
    await expect(only).toHaveAttribute('aria-checked', 'false');
    await expect(show).toHaveAttribute('aria-checked', 'true'); // default on (DEFAULT_LOCK_OPTIONS)

    await only.click();
    await expect(only).toHaveAttribute('aria-checked', 'false');
    await expect(sheet.getByText(MSG_BOTH, { exact: false })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Set up First-Then', exact: true })).toBeVisible();

    // Turning off is always allowed and clears the note; turning back on is blocked again.
    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(sheet.getByText(MSG_BOTH, { exact: false })).toHaveCount(0);
    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(sheet.getByText(MSG_BOTH, { exact: false })).toBeVisible();

    await expectNoOverflow(page, 'S23 lock sheet with First-Then blocked');
    await snap(page, 'extras-first-then-blocked');
  });

  test('22: /first-then/ names what is missing, and updates as each side is picked', async () => {
    await page.getByRole('dialog', { name: /'s view$/ }).getByRole('link', { name: 'Set up First-Then', exact: true }).click();
    await page.waitForURL('**/first-then/');

    // FirstThenPanels.tsx:161-180: EmptyState sentence + actions, plus the two empty panels.
    await expect(page.getByText(MSG_BOTH, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick what comes first', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick the reward that comes after', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose an activity', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a reward', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /^Done,/ })).toHaveCount(0);
    await expectNoOverflow(page, 'S15 first-then not set up');
    await snap(page, 'extras-first-then-not-set-up');

    await page.getByRole('button', { name: 'Pick what comes first', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Wake Up', exact: true }).click();
    await expect(page.getByText(MSG_THEN_ONLY, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick what comes first', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Pick the reward that comes after', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Ice cream/ }).click();
    await expect(page.getByText(/needs setting up first/)).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Done,/ })).toBeVisible();
  });

  test('22: once both are picked, both switches turn on', async () => {
    await gotoTab(page, 'today');
    await openViewSheet(page);
    const sheet = page.getByRole('dialog', { name: /'s view$/ });
    const only = sheet.getByRole('switch', { name: 'Only show First-Then, full page' });
    // exact: "Show First-Then" also substring-matches "Only show First-Then, full page".
    const show = sheet.getByRole('switch', { name: 'Show First-Then', exact: true });

    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByText(/needs setting up first/)).toHaveCount(0);

    await only.click();
    await expect(only).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByText(/needs setting up first/)).toHaveCount(0);
    await snap(page, 'extras-first-then-enabled');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('23: voice controls follow what the browser can actually record', async () => {
    await gotoTab(page, 'first-then');
    // Same test PanelVoice.tsx:37-38 uses for canRecord (caregiver mode is the case here).
    const canRecord = await page.evaluate(
      () => typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    );
    const branch = canRecord ? 'MediaRecorder AVAILABLE: record controls asserted' : 'MediaRecorder UNAVAILABLE: degraded state asserted';
    test.info().annotations.push({ type: 'media-recorder-branch', description: branch });
    console.log(`[day-extras 23] ${test.info().project.name}: ${branch}`);

    if (canRecord) {
      // PanelVoice.tsx:136 -> aria-label `Record your voice for ${label}`, label "First, <name>" / "Then, <name>".
      await expect(page.getByRole('button', { name: /^Record your voice for First, Wake Up/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Record your voice for Then, Ice cream/ })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /Record your voice/ })).toHaveCount(0);
    }
    // No clip has been recorded on either branch, so there is nothing to play.
    await expect(page.getByRole('button', { name: /^Hear / })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Done,/ })).toBeVisible();
    await expectNoOverflow(page, 'S15 first-then voice controls');
    await snap(page, canRecord ? 'extras-first-then-voice-available' : 'extras-first-then-voice-unavailable');
  });

  test('23: with MediaRecorder removed, the panels render and no record controls appear', async () => {
    // Deterministic degraded branch on every browser: strip MediaRecorder before the app boots.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'MediaRecorder', { value: undefined, configurable: true });
    });
    await gotoCaregiver(page, '/first-then/', password);

    expect(await page.evaluate(() => typeof MediaRecorder)).toBe('undefined');
    await expect(page.getByRole('checkbox', { name: /^Done,/ })).toBeVisible();
    await expect(page.getByText('Wake Up', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Record your voice/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Record .* again/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Hear / })).toHaveCount(0);
    await expectNoOverflow(page, 'S15 first-then without MediaRecorder');
    await snap(page, 'extras-first-then-no-recorder');
  });
});
