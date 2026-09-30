import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, reloadCaregiver, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

// Real clock, no fake timers: the shortest way to end a timer is the "Set duration"
// sheet (Minutes 0, Seconds N), not the 1 min preset. The end is then awaited with a
// polling expect, never a fixed sleep.
const RUN_SECONDS = 5;

// TimerTime.tsx:21 -> `Timer, ${text} remaining. ${editLabel}`; TimerScreen.tsx:285 sets editLabel.
const IDLE_TIME = (t: string) => `Timer, ${t} remaining. Change duration`;
// TimerPill.tsx:34 -> `Timer, ${time} remaining`
const PILL = /^Timer, \d+:\d\d remaining$/;
const PILL_ENDED = 'Timer, 0:00 remaining';

test.describe('timer end, sound and focus modes', () => {
  let page: Page;
  let password: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ({ password } = await signUp(page, { name: 'Timer Modes Tester' }));
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** Timer tab -> "Set duration" sheet (TimerScreen.tsx:214) -> 0:RUN_SECONDS. */
  async function setShortDuration(): Promise<void> {
    await page.getByRole('button', { name: /^Timer, .* remaining\. Change duration$/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Set duration' }); // Sheet.tsx:164 aria-label = title
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Minutes', { exact: true }).fill('0'); // TimerScreen.tsx:45
    await sheet.getByLabel('Seconds', { exact: true }).fill(String(RUN_SECONDS)); // TimerScreen.tsx:52
    await sheet.getByRole('button', { name: 'Set', exact: true }).click(); // TimerScreen.tsx:60
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: IDLE_TIME(`0:0${RUN_SECONDS}`) })).toBeVisible();
  }

  /** Start on the Timer tab, then leave it so the Today pill (not the tab) is what sees the end. */
  async function startAndLeaveForToday(): Promise<void> {
    await page.getByRole('button', { name: 'Start', exact: true }).click(); // TimerScreen.tsx:326
    await gotoTab(page, 'today');
    await expect(page.getByRole('button', { name: PILL })).toBeVisible();
  }

  /** Round trip through the Timer tab: proves the store hydrated, and that the timer came back idle. */
  async function expectIdleFullDuration(): Promise<void> {
    await gotoTab(page, 'timer');
    await expect(page.getByRole('button', { name: IDLE_TIME(`0:0${RUN_SECONDS}`) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await gotoTab(page, 'today');
  }

  test('#27 time\'s up shows once, Done clears it, and it stays gone', async () => {
    await gotoTab(page, 'timer');
    await setShortDuration();
    await startAndLeaveForToday();

    // The timer runs out while we are on Today: the pill flips to 0:00 (TimerPill's justEnded).
    const pill = page.getByRole('button', { name: PILL_ENDED });
    await expect(pill).toBeVisible({ timeout: 20_000 });
    await pill.click();

    const overlay = page.getByRole('dialog', { name: 'Timer' }); // TimerFullScreen.tsx:160
    await expect(overlay).toBeVisible();
    // p, not getByText: a VisuallyHidden live region repeats "Time's up" (TimerFullScreen.tsx:204).
    await expect(overlay.locator('p', { hasText: /Time.s up/ })).toBeVisible(); // :181
    await expectNoOverflow(page, 'timer time\'s up');
    await snap(page, 'timer-times-up');

    await overlay.getByRole('button', { name: 'Done', exact: true }).click(); // :183
    await expect(overlay).toBeHidden();
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);

    // Away to another tab and back: no overlay, no stale 0:00 pill.
    await gotoTab(page, 'chips');
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
    await expectIdleFullDuration();
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);

    // Full reload. expectIdleFullDuration proves the store hydrated before we trust the "gone" assertions.
    await reloadCaregiver(page, password);
    await expectIdleFullDuration();
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
  });

  test('#27 an end nobody acknowledged does not come back after a reload', async () => {
    // restoreState() (store.ts:130): an ended-but-unseen timer is reloaded idle, not re-armed.
    await gotoTab(page, 'timer');
    await startAndLeaveForToday();
    await expect(page.getByRole('button', { name: PILL_ENDED })).toBeVisible({ timeout: 20_000 });

    await reloadCaregiver(page, password);
    await expectIdleFullDuration();
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Timer' })).toHaveCount(0);
  });

  test('#27 looking at the Timer tab at the end acknowledges it (no pill after leaving)', async () => {
    // TimerScreen.tsx:198 effect. Stay on the tab through the end, then leave.
    await gotoTab(page, 'timer');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    // Ended + acknowledged = idle again: Start is back at the full duration.
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: IDLE_TIME(`0:0${RUN_SECONDS}`) })).toBeVisible();
    await gotoTab(page, 'today');
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
  });

  test('#25 the end sound is chooseable and the choice sticks', async () => {
    await gotoTab(page, 'timer');
    // TimerScreen.tsx:357 "Choose the sound" + the current label (:358) in one button.
    const row = page.getByRole('button', { name: /^Choose the sound/ });
    await expect(row).toContainText('Chime'); // TIMER_SOUNDS[0], lib/sound.ts:18
    await expectNoOverflow(page, 'timer screen');
    await row.click();

    const sheet = page.getByRole('dialog', { name: 'Sound at the end' }); // TimerScreen.tsx:230
    await expect(sheet).toBeVisible();
    // Select buttons carry aria-pressed (:176); labels from TIMER_SOUNDS (lib/sound.ts:18-21).
    const pick = (label: string) => sheet.getByRole('button', { name: new RegExp(`^${label}$`) });
    const play = (label: string) => sheet.getByRole('button', { name: `Play ${label} sound`, exact: true }); // :180
    for (const label of ['Chime', 'Chip', 'Rising', 'Falling']) {
      await expect(pick(label)).toBeVisible();
      await expect(play(label)).toBeVisible();
    }
    await expect(pick('Chime')).toHaveAttribute('aria-pressed', 'true');
    await expectNoOverflow(page, 'timer sound sheet');
    await snap(page, 'timer-sound-sheet');

    await pick('Rising').click();
    await expect(pick('Rising')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick('Chime')).toHaveAttribute('aria-pressed', 'false');
    // Preview must not close the sheet or change the choice.
    await play('Falling').click();
    await expect(pick('Rising')).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet).toBeVisible();

    await sheet.getByRole('button', { name: 'Close', exact: true }).click(); // Sheet.tsx:180
    await expect(sheet).toBeHidden();
    await expect(row).toContainText('Rising');

    // Sticks across a reload (persisted in kv).
    await reloadCaregiver(page, password);
    await expect(page.getByRole('button', { name: /^Choose the sound/ })).toContainText('Rising');
  });

  test('#32 Focus mode: round label, lengths sheet, skip, and back to Timer unchanged', async () => {
    await gotoTab(page, 'timer');
    // Park a recognisable normal duration to check the way back.
    await page.getByRole('button', { name: '2 min', exact: true }).click(); // TimerScreen.tsx:313
    await expect(page.getByRole('button', { name: IDLE_TIME('2:00') })).toBeVisible();

    // Segmented renders role="radio" inside a radiogroup named "Timer mode" (TimerScreen.tsx:264).
    const modes = page.getByRole('radiogroup', { name: 'Timer mode' });
    await expect(modes.getByRole('radio', { name: 'Timer', exact: true })).toHaveAttribute('aria-checked', 'true');
    await modes.getByRole('radio', { name: 'Focus', exact: true }).click();
    await expect(modes.getByRole('radio', { name: 'Focus', exact: true })).toHaveAttribute('aria-checked', 'true');

    // focusLabel() (focus.ts:42) in <p role="status"> (TimerScreen.tsx:273).
    const label = page.locator('p[role="status"]');
    await expect(label).toHaveText('Focus, round 1');
    await expect(page.getByRole('button', { name: IDLE_TIME('25:00') })).toBeVisible(); // DEFAULT_FOCUS_SETTINGS 25
    await expect(page.getByRole('button', { name: '2 min', exact: true })).toBeHidden(); // presets `hidden` (:302)
    await expect(page.getByText('Each interval waits for you to press Start.')).toBeVisible(); // :292
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
    await expectNoOverflow(page, 'timer focus mode');
    await snap(page, 'timer-focus-mode');

    // Lengths sheet: time tap opens it when idle in Focus mode (:250).
    await page.getByRole('button', { name: IDLE_TIME('25:00') }).click();
    const sheet = page.getByRole('dialog', { name: 'Focus lengths' }); // :243
    await expect(sheet).toBeVisible();
    const field = (name: string) => sheet.getByLabel(name, { exact: true }); // labels :86-91
    await expect(field('Focus (min)')).toHaveValue('25');
    await expect(field('Break (min)')).toHaveValue('5');
    await expect(field('Long break (min)')).toHaveValue('15');
    await expect(field('Long break every (rounds)')).toHaveValue('4');
    await expectNoOverflow(page, 'timer focus lengths sheet');
    await snap(page, 'timer-focus-lengths');
    await field('Focus (min)').fill('10');
    await field('Break (min)').fill('3');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click(); // :105
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: IDLE_TIME('10:00') })).toBeVisible();

    // Skip to break: the next interval waits for Start rather than running (:298).
    await page.getByRole('button', { name: 'Skip to break', exact: true }).click();
    await expect(label).toHaveText('Break after round 1');
    await expect(page.getByRole('button', { name: IDLE_TIME('3:00') })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip to focus', exact: true }).click();
    await expect(label).toHaveText('Focus, round 2');
    await expect(page.getByRole('button', { name: IDLE_TIME('10:00') })).toBeVisible();

    // Back to Timer: the normal timer is untouched (store.ts:228 restores normal_ms).
    await modes.getByRole('radio', { name: 'Timer', exact: true }).click();
    await expect(modes.getByRole('radio', { name: 'Timer', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(label).toHaveCount(0);
    await expect(page.getByRole('button', { name: IDLE_TIME('2:00') })).toBeVisible();
    await expect(page.getByRole('button', { name: '2 min', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Skip to / })).toHaveCount(0);
    await expect(page.getByText('Tap the time to type a duration')).toBeVisible(); // :293
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
    await expectNoOverflow(page, 'timer back to normal');
  });
});
