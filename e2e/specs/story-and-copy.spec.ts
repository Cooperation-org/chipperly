import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

const BETA_INVITE_CODE = 'e2e-beta-code';
const PASSWORD = 'correct-horse-battery-staple';

async function createAccount(page: Page, name: string): Promise<void> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/sign-up/');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`e2e-copy-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const inviteCodeField = page.getByLabel('Beta invite code', { exact: true });
  if (await inviteCodeField.isVisible()) await inviteCodeField.fill(BETA_INVITE_CODE);
  await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/onboarding/kind/');
}

// Client-side navigation only: a full page.goto() would reset parent_mode and bounce to /child/.
async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForURL('**/settings/');
}

const emojiGrid = (scope: Page | Locator) => scope.getByRole('radiogroup', { name: 'Choose a picture' });

// ---------------------------------------------------------------------------
// Items 9, 11, and the family half of 18 (one family account, one page).
// ---------------------------------------------------------------------------
test.describe('story editor emoji picker, read-aloud state, team wording', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Records what the story viewer asks the browser to say. It plays nothing and emits no
    // events by itself; the test fires the utterance's own start/end handlers (see item 11).
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const utterances: unknown[] = [];
      w.__utterances = utterances;
      w.__speechPath = typeof w.SpeechSynthesis === 'function' ? 'native-recorded' : 'standin-recorded';
      if (typeof w.SpeechSynthesis === 'function') {
        // Prototype patch: WebKit won't let window.speechSynthesis itself be redefined.
        SpeechSynthesis.prototype.speak = function (u: SpeechSynthesisUtterance) {
          utterances.push(u);
        };
        SpeechSynthesis.prototype.cancel = () => {};
      } else {
        w.SpeechSynthesisUtterance = class {
          onstart: (() => void) | null = null;
          onend: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor(public text: string) {}
        };
        w.speechSynthesis = { speak: (u: unknown) => utterances.push(u), cancel: () => {} };
      }
    });
    await signUp(page, { name: 'Story Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('9: the story cover emoji grid starts collapsed, opens on tap, and closes after a choice', async () => {
    await gotoTab(page, 'stories');
    // StoriesScreen.tsx:102 template button "Haircut" (same name timer-stories.spec.ts uses).
    await page.getByRole('button', { name: 'Haircut', exact: true }).click();
    await page.waitForURL('**/story/edit/**');
    await expect(page.getByRole('heading', { name: 'Edit story', level: 1 })).toBeVisible();

    // PicturePicker.tsx:95-108 trigger: <button aria-expanded>Emoji</button>; StoryForm.tsx:169 passes defaultEmojiOpen={false}.
    const trigger = page.getByRole('button', { name: 'Emoji', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // EmojiGrid.tsx:15 radiogroup "Choose a picture": absent, so the form is not buried.
    await expect(emojiGrid(page)).toHaveCount(0);
    // "Add page" is NOT asserted in the viewport: this form is longer than a 390px
    // phone screen regardless. What the owner asked for is that 96 emoji cells stop
    // burying it, so measure that directly — the page must get materially longer
    // when the grid opens, which is exactly the length collapsing gives back.
    const collapsedHeight = await page.evaluate(() => document.body.scrollHeight);
    await snap(page, 'story-editor-emoji-collapsed');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(emojiGrid(page)).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(collapsedHeight);
    await expect(emojiGrid(page).getByRole('radio')).not.toHaveCount(0);
    await expectNoOverflow(page, 'story editor emoji open');
    await snap(page, 'story-editor-emoji-open');

    // A choice applies (aria-label of each cell is the emoji itself, EmojiGrid.tsx:24) and collapses the grid.
    const cell = emojiGrid(page).getByRole('radio').nth(2);
    const chosen = await cell.getAttribute('aria-label');
    expect(chosen).toBeTruthy();
    await cell.click();
    await expect(emojiGrid(page)).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Reopening shows that emoji as the checked one, so the choice really landed in the form.
    await trigger.click();
    await expect(emojiGrid(page).getByRole('radio', { name: chosen as string, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await trigger.click();
    await expect(emojiGrid(page)).toHaveCount(0);
    await expectNoOverflow(page, 'story editor emoji collapsed again');
  });

  test('9: a page picture picker in the story editor also starts collapsed', async () => {
    // StoryForm.tsx:176-180 aria-label "Change picture for page 1"; sheet title "Page 1 picture" (StoryForm.tsx:106).
    await page.getByRole('button', { name: 'Change picture for page 1', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Page 1 picture' });
    await expect(sheet).toBeVisible();
    const trigger = sheet.getByRole('button', { name: 'Emoji', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(emojiGrid(sheet)).toHaveCount(0);

    await trigger.click();
    await expect(emojiGrid(sheet)).toBeVisible();
    await emojiGrid(sheet).getByRole('radio').nth(5).click();
    // StoryForm's onChange closes the sheet after a choice.
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/stories/');
    await expect(page.getByRole('button', { name: 'Getting a Haircut', exact: true })).toBeVisible();
  });

  test('9: every other picture picker starts collapsed too, and opens as a real grid', async () => {
    await openSettings(page);
    // Not exact: the row's name is "<profile name> Edit profile" (photo-upload.spec.ts:168).
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');

    // Owner, 30 Sept: collapsed everywhere, not just in the story editor.
    const trigger = page.getByRole('button', { name: 'Emoji', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(emojiGrid(page)).toHaveCount(0);

    await trigger.click();
    await expect(emojiGrid(page)).toBeVisible();

    // It must open as a GRID, not one tall scrolling column: the wrapper that holds the
    // grid sits in a centred flex column, so without its own width it shrinks to content
    // and every cell stacks. Prove several cells share a row.
    const cells = emojiGrid(page).getByRole('radio');
    await expect(cells.first()).toBeVisible();
    const topOfFirstRow = await cells.nth(0).evaluate((el) => el.getBoundingClientRect().top);
    const sameRow = await cells.nth(3).evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(sameRow - topOfFirstRow), 'the 1st and 4th cells should share a row').toBeLessThan(4);

    await expectNoOverflow(page, 'edit profile emoji grid open');
    await snap(page, 'edit-profile-emoji-grid');
  });

  test('11: read aloud never says "Playing" from a click, only from real playback events', async ({}, testInfo) => {
    await gotoTab(page, 'stories');
    // StoriesScreen.tsx:119 cover button aria-label = story title.
    await page.getByRole('button', { name: 'Getting a Haircut', exact: true }).click();
    // StoryViewer.tsx:101 dialog aria-label = story.title.
    const viewer = page.getByRole('dialog', { name: 'Getting a Haircut' });
    await expect(viewer).toBeVisible();

    const path = await page.evaluate(() => (window as unknown as { __speechPath: string }).__speechPath);
    testInfo.annotations.push({ type: 'read-aloud path', description: path });

    // StoryViewer.tsx:158: label is 'Read aloud' for a text page (no recording), 'Playing' only while playing.
    const button = viewer.getByRole('button', { name: 'Read aloud', exact: true });
    await expect(button).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Playing', exact: true })).toHaveCount(0);

    await button.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __utterances: unknown[] }).__utterances.length)).toBe(1);
    // The utterance was queued but the browser has reported nothing. No timer may flip the button.
    await page.waitForTimeout(700);
    await expect(viewer.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Playing', exact: true })).toHaveCount(0);

    const fire = (handler: 'onstart' | 'onend' | 'onerror') =>
      page.evaluate((h) => {
        const list = (window as unknown as { __utterances: Record<string, (() => void) | null>[] }).__utterances;
        list[list.length - 1]?.[h]?.();
      }, handler);

    // The utterance's own start event (useReadAloud.ts:36) is what turns it on.
    await fire('onstart');
    const playing = viewer.getByRole('button', { name: 'Playing', exact: true });
    await expect(playing).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Read aloud', exact: true })).toHaveCount(0);
    await expectNoOverflow(page, 'story viewer playing');
    await snap(page, 'story-viewer-playing');

    // Its end event turns it off.
    await fire('onend');
    await expect(viewer.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
    await expect(playing).toHaveCount(0);

    // An error must not leave it stuck on either (useReadAloud.ts:40).
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __utterances: unknown[] }).__utterances.length)).toBe(2);
    await fire('onstart');
    await expect(playing).toBeVisible();
    await fire('onerror');
    await expect(playing).toHaveCount(0);

    // Turning the page while playing stops it (StoryViewer.tsx:39-41).
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __utterances: unknown[] }).__utterances.length)).toBe(3);
    await fire('onstart');
    await expect(playing).toBeVisible();
    await viewer.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(playing).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();

    // A late start event from the abandoned utterance cannot revive it (utteranceRef guard, useReadAloud.ts:37).
    await fire('onstart');
    await page.waitForTimeout(300);
    await expect(playing).toHaveCount(0);

    await viewer.getByRole('button', { name: 'Close story', exact: true }).click();
    await expect(viewer).toBeHidden();
  });

  test('18: a family account keeps the team wording', async () => {
    await openSettings(page);
    // SettingsMenu.tsx:103 row name `${name}'s view` (settingsCopy.viewTitle).
    await page.getByRole('button', { name: "Benny's view", exact: true }).click();
    const sheet = page.getByRole('dialog', { name: "Benny's view" });
    // LockSheet.tsx:162 pinIntro, shown before any PIN exists.
    await expect(sheet.getByText("Set a PIN first. You'll need it to get back from Benny's view.")).toBeVisible();
    await expect(sheet).not.toContainText('from your view');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    // ProfileForm.tsx:134-135 rewardToggle + Switch label.
    await expect(page.getByText('Alert me when Benny wants a reward', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Reward alerts', exact: true })).toBeVisible();
    // ReviewReminderSetting.tsx:62 (curly apostrophe in settingsCopy.ts:24) and :106 hint (needs the reminder loaded and on).
    await expect(page.getByText(/^Remind me to check Benny.s routines$/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Just for you; others supporting Benny choose their own.', { exact: true })).toBeVisible();
    await expect(page.getByText('Remind me when I\'m ready for a reward')).toHaveCount(0);
    await expectNoOverflow(page, 'family edit profile wording');
    await snap(page, 'family-edit-profile-wording');
  });
});

// ---------------------------------------------------------------------------
// Items 3 and 4: the real interview, then the plan it built.
// ---------------------------------------------------------------------------
test.describe('starter plan wording and shape', () => {
  test('"After school" never "Day Program", and teeth/dressed are steps of the morning routine', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Plan Tester');
    await page.getByRole('button', { name: /My family/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await page.getByLabel('Name', { exact: true }).fill('Mia');
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Choose a picture' }).getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: '2 to 7' }).click();

    // Week tiles (SetupQuestions.tsx:85, names from setup.ts:54-59): "After school", not "Day Program".
    await expect(page.getByRole('heading', { name: "What's in a typical week?" })).toBeVisible();
    const afterSchool = page.getByRole('button', { name: 'After school', exact: true });
    await expect(afterSchool).toBeVisible();
    await expect(page.getByText(/day program/i)).toHaveCount(0);
    await afterSchool.click();
    await expect(afterSchool).toHaveAttribute('aria-pressed', 'true');
    await expectNoOverflow(page, 'plan: week');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // Routine tiles (setup.ts:61-71): pick teeth and dressed as well as the morning routine.
    await expect(page.getByRole('heading', { name: 'Which routines should we start with?' })).toBeVisible();
    await page.getByRole('button', { name: 'Getting dressed', exact: true }).click();
    await page.getByRole('button', { name: 'Brushing teeth', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Getting dressed', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Brushing teeth', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What does Mia love?' })).toBeVisible();
    await page.getByRole('button', { name: "Create Mia's plan", exact: true }).click();

    // Ready summary (Ready.tsx:54): one Morning Routine with the six steps, and no standalone teeth/dressed line.
    await page.waitForURL('**/onboarding/ready/');
    await expect(page.getByRole('heading', { name: 'Mia is ready.' })).toBeVisible();
    await expect(page.getByText('Morning Routine · 6 steps')).toBeVisible();
    await expect(page.getByText('Bedtime Routine · 5 steps')).toBeVisible();
    await expect(page.getByText(/getting dressed|brushing teeth|get dressed|brush teeth/i)).toHaveCount(0);
    await expect(page.getByText(/day program/i)).toHaveCount(0);
    await snap(page, 'plan-ready-summary');
    await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
    await page.waitForURL('**/today/');

    // The saved plan, as the library shows it once sync has landed the seeded rows.
    await openSettings(page);
    await page.getByRole('button', { name: 'Activities', exact: true }).click();
    await page.waitForURL('**/settings/library/activities/');
    // LibraryList.tsx:515 rows are plain activities only (routines are filtered out, :394).
    await expect(page.getByText('After School', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Weekdays').first()).toBeVisible();
    for (const gone of ['Day Program', 'Getting dressed', 'Brushing teeth', 'Get Dressed', 'Brush Teeth', 'Morning Routine']) {
      await expect(page.getByText(gone, { exact: true }), `"${gone}" is not a standalone activity`).toHaveCount(0);
    }
    await expect(page.getByText(/day program/i)).toHaveCount(0);
    await expectNoOverflow(page, 'plan: activities library');
    await snap(page, 'plan-activities-library');

    await page.goBack();
    await page.waitForURL('**/settings/');
    await page.getByRole('button', { name: 'Routines', exact: true }).click();
    await page.waitForURL('**/settings/library/routines/');
    // LibraryList.tsx:532 secondary "6 steps".
    await expect(page.getByText('Morning Routine', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('6 steps').first()).toBeVisible();
    await expect(page.getByText('Getting dressed', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Brushing teeth', { exact: true })).toHaveCount(0);
    await snap(page, 'plan-routines-library');

    // Open the Morning Routine: dressed and teeth are steps 3 and 4 of it (setup.ts:171-178).
    await page.getByRole('button', { name: /^Morning Routine/ }).click();
    await page.waitForURL('**/activity/edit/**');
    // ActivityForm.tsx:562 aria-label `Picture for step N, <name>`. Position is NOT
    // asserted: the guarantee is that these are steps OF the morning routine rather
    // than standalone activities, and pinning them to 3 and 4 would break the test
    // the moment the seed's order changes for a good reason.
    const brushStep = page.getByRole('button', { name: /^Picture for step \d+, Brush Teeth$/ });
    const dressedStep = page.getByRole('button', { name: /^Picture for step \d+, Get Dressed$/ });
    // FormRow.tsx:19 the summary button carries aria-expanded, so branch on THAT, not on
    // whether a step is on screen yet: the steps arrive asynchronously from Dexie, so a
    // count of 0 can simply mean "not loaded", and clicking then shuts an open row.
    const stepsRow = page.getByRole('button', { name: /^Steps/ });
    await expect(stepsRow).toBeVisible();
    // Retry rather than assume one click did it: on WebKit the click can land before
    // hydration attaches the handler, leaving the row shut with no error.
    await expect(async () => {
      if ((await stepsRow.getAttribute('aria-expanded')) !== 'true') await stepsRow.click();
      await expect(stepsRow).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(brushStep).toBeVisible();
    await expect(dressedStep).toBeVisible();
    await expectNoOverflow(page, 'plan: morning routine steps');
    await page.close();
  });
});

// ---------------------------------------------------------------------------
// The self-managed half of 18.
// ---------------------------------------------------------------------------
test.describe('self-managed wording', () => {
  test('a "Myself" account says "Remind me" and never mentions others supporting them', async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, 'Solo Copy');
    await page.getByRole('button', { name: /Myself/ }).click();
    await page.waitForURL('**/onboarding/profile/');
    await page.getByRole('button', { name: 'Skip setup', exact: true }).click();
    await page.waitForURL('**/onboarding/ready/');
    await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
    await page.waitForURL('**/today/');

    await openSettings(page);
    // settingsCopy.viewTitle self-managed = "Your view" (SettingsMenu.tsx:101). Waits for the account row to load.
    const viewRow = page.getByRole('button', { name: 'Your view', exact: true });
    await expect(viewRow).toBeVisible({ timeout: 20_000 });
    await viewRow.click();
    const sheet = page.getByRole('dialog', { name: 'Your view' });
    // LockSheet.tsx:162 pinIntro.
    await expect(sheet.getByText("Set a PIN first. You'll need it to get back from your view.")).toBeVisible();
    await expect(sheet).not.toContainText('supporting');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/**');
    // ProfileForm.tsx:134-135: "Remind me when I'm ready for a reward" / switch "Reward reminders".
    await expect(page.getByText("Remind me when I'm ready for a reward", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('switch', { name: 'Reward reminders', exact: true })).toBeVisible();
    // ReviewReminderSetting.tsx:62 "Remind me to check my routines"; the hint at :106 is dropped (reviewHint null).
    await expect(page.getByText('Remind me to check my routines', { exact: true })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/alert me/i)).toHaveCount(0);
    await expect(page.getByText(/others supporting/i)).toHaveCount(0);
    await expect(page.getByText(/reward alerts/i)).toHaveCount(0);
    // The hint would sit under the time chips; the reminder is on by default (every 7 days), so its absence is meaningful.
    await expect(page.getByRole('group', { name: 'Common times' })).toBeVisible();
    await expectNoOverflow(page, 'self-managed edit profile wording');
    await snap(page, 'self-managed-edit-profile-wording');
    await page.close();
  });
});
