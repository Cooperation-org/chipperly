import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

// Every (caregiver)-shell route from docs/CONTRACTS.md reachable while
// signed in with an active profile, in create-mode where an id would
// otherwise be required. /settings/profile/edit/?id= is checked separately
// below (it needs a real profile id, fetched by following the UI).
const ROUTES: { path: string; name: string }[] = [
  { path: '/today/', name: 'today' },
  { path: '/activity/edit/', name: 'new activity' },
  { path: '/reward/edit/', name: 'new reward' },
  { path: '/chips/', name: 'chips' },
  { path: '/chips/history/', name: 'chip history' },
  { path: '/timer/', name: 'timer' },
  { path: '/first-then/', name: 'first-then' },
  { path: '/stories/', name: 'stories' },
  { path: '/story/edit/', name: 'new story' },
  { path: '/settings/', name: 'settings' },
  { path: '/settings/profiles/', name: 'profiles' },
  { path: '/settings/library/activities/', name: 'library activities' },
  { path: '/settings/library/rewards/', name: 'library rewards' },
  { path: '/settings/library/locations/', name: 'library locations' },
  { path: '/settings/care-team/', name: 'care team' },
  { path: '/settings/attitude/', name: 'attitude history' },
  { path: '/settings/account/', name: 'account' },
];

async function assertButtonsHaveNames(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('button').forEach((b) => {
      if (b.closest('[aria-hidden="true"]')) return;
      const style = getComputedStyle(b);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const label = b.getAttribute('aria-label');
      const text = b.textContent?.trim();
      const hasImgAlt = Array.from(b.querySelectorAll('img')).some((img) => img.alt?.trim());
      if (!label && !text && !hasImgAlt) bad.push(b.outerHTML.slice(0, 160));
    });
    return bad;
  });
  expect(problems, `buttons with no accessible name: ${problems.join('\n')}`).toHaveLength(0);
}

async function assertNoImageWithoutAlt(page: Page): Promise<void> {
  const problems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => !img.alt || img.alt.trim().length === 0)
      .map((img) => img.outerHTML.slice(0, 160)),
  );
  expect(problems, `images with no alt text: ${problems.join('\n')}`).toHaveLength(0);
}

async function assertOneHeadingOrTitledTopBar(page: Page): Promise<void> {
  const h1Count = await page.getByRole('heading', { level: 1 }).count();
  if (h1Count === 1) return;
  const topBarText = (await page.locator('header').first().innerText().catch(() => '')).trim();
  expect(
    h1Count === 0 && topBarText.length > 0,
    `expected exactly one h1, or (zero h1s and a labelled top bar); got ${h1Count} h1(s) and top bar text "${topBarText}"`,
  ).toBe(true);
}

async function assertFocusRingVisible(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline, 'first tabbable element should have a visible focus ring').not.toBe('none');
}

async function assertTabNavForProject(page: Page, projectName: string): Promise<void> {
  const tabBar = page.locator('nav[aria-label="Primary"][data-shell-tabbar]');
  const tabRail = page.locator('nav[aria-label="Primary"][data-shell-nav]');
  if (projectName === 'desktop') {
    await expect(tabRail).toBeVisible();
    await expect(tabBar).toBeHidden();
  } else {
    await expect(tabBar).toBeVisible();
    await expect(tabRail).toBeHidden();
  }
}

test.describe('a11y and layout', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Layout Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const route of ROUTES) {
    test(`route ${route.path}`, async ({}, testInfo) => {
      await page.goto(route.path);
      await expectNoOverflow(page, route.name);
      await snap(page, `route-${route.name.replace(/\s+/g, '-')}`);
      await assertOneHeadingOrTitledTopBar(page);
      await assertNoImageWithoutAlt(page);
      await assertButtonsHaveNames(page);
      await assertFocusRingVisible(page);
      await assertTabNavForProject(page, testInfo.project.name);
    });
  }

  test('settings/profile/edit/?id= (followed via UI)', async () => {
    await page.goto('/settings/');
    // Not `exact: true`: the row's accessible name is "Benny Edit profile"
    // (the picture tile's role=img aria-label is "Benny", concatenated
    // before the row's own text — components/ui/ListRow.tsx).
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.waitForURL('**/settings/profile/edit/?id=**');
    await expectNoOverflow(page, 'edit profile');
    await snap(page, 'route-edit-profile');
    await assertOneHeadingOrTitledTopBar(page);
    await assertNoImageWithoutAlt(page);
    await assertButtonsHaveNames(page);
  });

  test('phone/tablet: Today content clears the tab bar', async ({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'TabRail on desktop does not overlay content');
    await page.goto('/today/');
    // The starter plan seeds rows on a fresh profile, so there's always at
    // least one to check clearance against.
    const rows = page.locator('button[class*="ListRow_main"]');
    await expect(rows.first()).toBeVisible();
    const tabBar = page.locator('nav[aria-label="Primary"][data-shell-tabbar]');
    const tabBarBox = await tabBar.boundingBox();
    if (!tabBarBox) return;
    // The starter plan's 9-12 rows no longer fit in one viewport (unlike the
    // single row this test used to add), so scroll the last one into view
    // before checking it clears the fixed tab bar; the page's own
    // padding-bottom (CaregiverShell.module.css) is what should keep it clear.
    await rows.last().scrollIntoViewIfNeeded();
    const lastRowBox = await rows.last().boundingBox();
    expect(lastRowBox).not.toBeNull();
    if (!lastRowBox) return;
    expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(tabBarBox.y + 1);
  });
});
