import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

async function enterPin(page: Page, digits: string): Promise<void> {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

type Earn = 'always' | 'chips' | 'task';

// RewardForm.tsx:200-206 Segmented "How to get it" -> role="radio" (Segmented.tsx:47).
const EARN_RADIO: Record<Earn, string> = {
  always: 'Always available',
  chips: 'Costs chips',
  task: 'After a task',
};
// RewardForm.tsx:163-164 costSummary, shown inside the "How to get it" row button.
const EARN_SUMMARY: Record<Earn, RegExp> = {
  always: /Always available/,
  chips: /1 chip/,
  task: /After Wake Up/,
};

/**
 * Chips > Free time choices > Create new (FreeTimeSheet.tsx:120 aria-label
 * "Create new") -> /reward/edit/, pick "How to get it", Save. Client-side
 * navigation only, so parent_mode stays unlocked. Save does router.back()
 * (RewardForm.tsx:133) and lands on /chips/.
 */
async function createReward(page: Page, name: string, earn: Earn): Promise<void> {
  await page.getByRole('button', { name: 'Free time choices', exact: true }).click();
  await page.getByRole('dialog', { name: 'Free time' }).getByRole('button', { name: 'Create new', exact: true }).click();
  await page.waitForURL('**/reward/edit/**');

  // Name row is open by default on a new reward (RewardForm.tsx:69); TextField label "Name" (:172).
  await page.getByLabel('Name', { exact: true }).fill(name);

  // FormRow's toggle is a button named "How to get it <summary>" (FormRow.tsx:19-21).
  await page.getByRole('button', { name: /^How to get it/ }).click();
  const group = page.getByRole('radiogroup', { name: 'How to get it' });
  await group.getByRole('radio', { name: EARN_RADIO[earn], exact: true }).click();
  await expect(group.getByRole('radio', { name: EARN_RADIO[earn], exact: true })).toHaveAttribute('aria-checked', 'true');

  if (earn === 'task') {
    // Field label "Task to finish first" htmlFor="requires-activity" (RewardForm.tsx:211-212).
    await page.getByLabel('Task to finish first').selectOption({ label: 'Wake Up' });
  }
  await expect(page.getByRole('button', { name: /^How to get it/ })).toContainText(EARN_SUMMARY[earn]);

  await page.getByRole('button', { name: 'Save', exact: true }).click(); // RewardForm.tsx:277
  await page.waitForURL('**/chips/');
}

test.describe('rewards: how to get it, and changing the working-for reward', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Rewards Tester' });
    await gotoTab(page, 'chips');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('#21 working-for card: the picture sits above the chip strip', async () => {
    // Pick a reward first so the card has a picture and a strip (ChipsScreen.tsx:186).
    // Reward button name is "Working for <img name> <text>" (ChipsScreen.tsx:175-181), so match the prefix.
    await page.getByRole('button', { name: /^Working for/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Ice cream/ }).click(); // Picker.tsx:188 "Ice cream, 5 chips"

    const rewardButton = page.getByRole('button', { name: /^Working for/ });
    await expect(rewardButton).toContainText('Ice cream');

    // PictureTile is role="img" aria-label={name} (PictureTile.tsx:34,42,52).
    const picture = rewardButton.getByRole('img', { name: 'Ice cream' });
    // ChipStrip's tap target: aria-label "N of M chips" (ChipStrip.tsx:25,55). ChipBoard buttons read "Set chips to ..." so this is unique.
    const strip = page.getByRole('button', { name: /^\d+ of \d+ chips$/ });
    await expect(picture).toBeVisible();
    await expect(strip).toBeVisible();

    const pictureBox = await picture.boundingBox();
    const stripBox = await strip.boundingBox();
    expect(pictureBox, 'picture has a box').not.toBeNull();
    expect(stripBox, 'strip has a box').not.toBeNull();
    // Strip is below the picture: it starts at or under the picture's bottom edge.
    expect(stripBox!.y).toBeGreaterThanOrEqual(pictureBox!.y + pictureBox!.height - 1);

    await expectNoOverflow(page, 'chips working-for card');
    await snap(page, 'rewards-working-for-card');
  });

  test('#12 the reward and the chip strip open the same picker', async () => {
    const rewardButton = page.getByRole('button', { name: /^Working for/ });
    const strip = page.getByRole('button', { name: /^\d+ of \d+ chips$/ });

    // Different names on purpose: one names the reward, the other reads the chip count.
    await expect(rewardButton).toContainText('Ice cream');
    await expect(strip).toHaveAccessibleName(/^\d+ of \d+ chips$/);

    // Target 1: the reward itself.
    await rewardButton.click();
    let sheet = page.getByRole('dialog', { name: 'Working for...' }); // ChipsScreen.tsx:100 title
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Ice cream/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Toy/ })).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click(); // Sheet.tsx:180
    await expect(sheet).toBeHidden();

    // Target 2: the chip strip. Same dialog, same options, and picking changes the reward.
    await strip.click();
    sheet = page.getByRole('dialog', { name: 'Working for...' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Ice cream/ })).toBeVisible();
    await sheet.getByRole('button', { name: /^Toy/ }).click();
    await expect(sheet).toBeHidden();
    await expect(rewardButton).toContainText('Toy');
    await expectNoOverflow(page, 'chips after picking via strip');
  });

  test('#15 all three "How to get it" options save', async () => {
    await createReward(page, 'Bubbles', 'always');
    await createReward(page, 'Movie night', 'task');
    await createReward(page, 'Stickers', 'chips');

    await page.getByRole('button', { name: 'Free time choices', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();

    // Always available: a free-time tile, nothing gating it (FreeTimeSheet.tsx:129-140).
    const bubbles = sheet.getByRole('button', { name: /Bubbles/ });
    await expect(bubbles).toHaveAttribute('aria-disabled', 'false');
    await expect(bubbles).not.toContainText('After');

    // After a task: a tile that is locked and says why. Today's Wake Up is not done yet.
    const movie = sheet.getByRole('button', { name: /Movie night/ });
    await expect(movie).toHaveAttribute('aria-disabled', 'true');
    await expect(movie).toContainText('After Wake Up');

    // Costs chips: not a tile, it is in the "Earned rewards" list with its cost (FreeTimeSheet.tsx:146-158).
    const stickers = sheet.locator('li', { hasText: 'Stickers' });
    await expect(stickers).toContainText('1 chips');
    await expect(sheet.getByRole('button', { name: /Stickers/ })).toHaveCount(0);

    await expectNoOverflow(page, 'free time choices, three kinds');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  });

  test('lock into the child view (child-rewards.spec.ts)', async () => {
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
  });

  test('#15 child: a task-gated free choice is visible but not pickable until the task is done', async () => {
    // Gated. ChildToday.tsx:706 "Free time" button opens FreeTimeSheet with canCreate=false.
    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    let sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();

    let movie = sheet.getByRole('button', { name: /Movie night/ });
    await expect(movie).toBeVisible(); // not silently hidden
    await expect(movie).toHaveAttribute('aria-disabled', 'true');
    await expect(movie).toContainText('After Wake Up'); // the reason, FreeTimeSheet.tsx:139
    // force: Playwright will not click an aria-disabled element, and the point here is
    // to prove a real tap does nothing rather than to rely on the attribute alone.
    await movie.click({ force: true });
    await expect(movie).toHaveAttribute('aria-pressed', 'false'); // handlePick bailed out (:68)

    // The ungated free choice is pickable right now.
    const bubbles = sheet.getByRole('button', { name: /Bubbles/ });
    await expect(bubbles).toHaveAttribute('aria-disabled', 'false');

    await expectNoOverflow(page, 'child free time, gated');
    await snap(page, 'rewards-child-free-choice-gated');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();

    // Do the task.
    const wakeUp = page.getByRole('checkbox', { name: /^Wake Up,/ }); // child.spec.ts:111
    await wakeUp.click();
    await expect(wakeUp).toHaveAttribute('aria-checked', 'true');

    // Unlocked: same tile, no reason, and pickable.
    await page.getByRole('button', { name: 'Free time', exact: true }).click();
    sheet = page.getByRole('dialog', { name: 'Free time' });
    await expect(sheet).toBeVisible();
    movie = sheet.getByRole('button', { name: /Movie night/ });
    await expect(movie).toHaveAttribute('aria-disabled', 'false');
    await expect(movie).not.toContainText('After Wake Up');
    await movie.click();
    await expect(movie).toHaveAttribute('aria-pressed', 'true');
    await expectNoOverflow(page, 'child free time, unlocked');
    await snap(page, 'rewards-child-free-choice-unlocked');
  });
});
