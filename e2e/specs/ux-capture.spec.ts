import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';

// Design hand-off, not a test: walks each setup flow and saves every screen
// as PNG plus an editable SVG (dom-to-svg, real text and shapes) for Figma.
// Skipped unless UX_CAPTURE=1. UX_OUT is the output folder, DOM_TO_SVG the
// browser bundle of dom-to-svg (window.__domToSvg).
// ponytail: walks the default path only (no "one goal" branch, no errors).
const OUT = process.env.UX_OUT ?? 'ux-capture';
const BUNDLE = process.env.DOM_TO_SVG ?? '';
const BETA_INVITE_CODE = 'e2e-beta-code';

test.skip(!process.env.UX_CAPTURE, 'design capture only runs with UX_CAPTURE=1');
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const FLOWS = [
  { folder: 'individual-setup', tile: /Myself/, person: 'Alex' },
  { folder: 'household-setup', tile: /My family/, person: 'Benny' },
  { folder: 'organization-setup', tile: /My organization/, person: 'Jordan' },
];

async function save(page: Page, dir: string, n: number, label: string): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400); // let entry animations settle
  const name = `${String(n).padStart(2, '0')}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  await page.screenshot({ path: path.join(dir, 'png', `${name}.png`), fullPage: true });
  if (!BUNDLE) return;
  await page.addScriptTag({ path: BUNDLE });
  const svg = await page.evaluate(async () => {
    const lib = (window as unknown as { __domToSvg: any }).__domToSvg;
    const doc = lib.documentToSVG(document);
    await lib.inlineResources(doc.documentElement);
    return new XMLSerializer().serializeToString(doc);
  });
  // next/font names the faces "body"/"heading"; Figma needs the real Google Fonts names.
  const named = svg.replace(/font-family="heading,[^"]*"/g, 'font-family="Alegreya, serif"').replace(/font-family="body,[^"]*"/g, 'font-family="Alegreya Sans, sans-serif"')
    // The @font-face block points at the test server, which is gone once the run ends.
    .replace(/<style>[\s\S]*?<\/style>/g, '');
  writeFileSync(path.join(dir, 'svg', `${name}.svg`), named);
}

async function heading(page: Page): Promise<string> {
  // Some screens redirect right after the first paint ("Myself" skips the name form), so let it settle.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  return ((await page.locator('h1:visible').first().textContent({ timeout: 10_000 })) ?? 'screen').trim();
}

for (const flow of FLOWS) {
  test(flow.folder, async ({ page }) => {
    const dir = path.join(OUT, flow.folder);
    mkdirSync(path.join(dir, 'png'), { recursive: true });
    mkdirSync(path.join(dir, 'svg'), { recursive: true });
    let n = 1;

    await page.goto('/sign-up/');
    await save(page, dir, n++, 'sign-up');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.getByLabel('Name', { exact: true }).fill(flow.folder === 'individual-setup' ? flow.person : 'Sam Rivera');
    await page.getByLabel('Email', { exact: true }).fill(`ux-${unique}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
    const invite = page.getByLabel('Beta invite code', { exact: true });
    if (await invite.isVisible()) await invite.fill(BETA_INVITE_CODE);
    await page.getByRole('checkbox', { name: /setting Chipperly up for myself/i }).check();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.waitForURL('**/onboarding/kind/');
    await save(page, dir, n++, await heading(page));
    await page.getByRole('button', { name: flow.tile }).click();
    await page.waitForURL('**/onboarding/profile/');

    // Walk the questions by heading until Ready, then whatever comes after it.
    for (let guard = 0; guard < 15; guard += 1) {
      const h = await heading(page);
      if (h === "What's their name?") {
        await save(page, dir, n++, 'name-empty');
        await page.getByLabel('Name', { exact: true }).fill(flow.person);
        await page.getByRole('button', { name: 'Emoji', exact: true }).click();
        await page.getByRole('radiogroup', { name: 'Choose a picture' }).getByRole('radio').first().click();
        await save(page, dir, n++, 'name-filled');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      } else if (h.startsWith('How old is')) {
        await save(page, dir, n++, 'age');
        await page.getByRole('button', { name: '8 to 12' }).click();
      } else if (/earns? with chips|can always choose/.test(h)) {
        await save(page, dir, n++, h);
        await page.locator('button[aria-pressed="false"]').first().click();
        await save(page, dir, n++, `${h} picked`);
        const create = page.getByRole('button', { name: /^Create .+ plan$/ });
        if (await create.isVisible()) await create.click();
        else await page.getByRole('button', { name: 'Continue', exact: true }).click();
      } else if (h.endsWith('is ready.')) {
        await save(page, dir, n++, 'ready');
        await page.getByRole('button', { name: 'Go to Today', exact: true }).click();
        await page.waitForURL(/\/(onboarding\/device|today)\//);
        if (page.url().includes('/onboarding/device/')) await save(page, dir, n++, await heading(page));
        break;
      } else {
        await save(page, dir, n++, h);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.waitForFunction((prev) => document.querySelector('h1')?.textContent?.trim() !== prev, h, { timeout: 15_000 });
    }
  });
}
