// Captures product screenshots for the marketing site from a running
// Chipperly app (the public demo by default), phone-sized at 3x, into
// public/screens/. Rerun after UI changes:
//   node scripts/capture-screens.mjs [step]
// Env: APP_URL, DEMO_EMAIL, DEMO_PASSWORD.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const APP = (process.env.APP_URL || 'https://demos.linkedtrust.us/chipperly-next').replace(/\/$/, '');
const EMAIL = process.env.DEMO_EMAIL || 'demo@chipperlyapp.com';
const PASSWORD = process.env.DEMO_PASSWORD || 'Chipperly-Demo-2026';
const OUT = fileURLToPath(new URL('../public/screens/', import.meta.url));
const only = process.argv[2];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
const page = await ctx.newPage();

async function shot(name) {
  await page.waitForTimeout(1200);
  await sharp(await page.screenshot()).webp({ quality: 86 }).toFile(`${OUT}${name}.webp`);
  console.log('saved', name);
}

// The demo holds the owner's family photos. Never publish a child's photo
// without consent: every uploaded image is swapped for an emoji tile.
await ctx.grantPermissions(['notifications'], { origin: new URL(APP).origin });
await ctx.addInitScript(() => {
  const EMOJI = { 'Donut hole': '\u{1F369}', Benny: '\u{1F981}' };
  const tile = (alt) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e8f3f1"/><text x="50" y="68" font-size="56" text-anchor="middle">${EMOJI[alt] ?? '⭐'}</text></svg>`,
    );
  const swap = () => {
    for (const img of document.images) {
      if (img.src.includes('/api/media/')) img.src = tile(img.alt);
    }
  };
  new MutationObserver(swap).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
});

await page.goto(`${APP}/`);
await page.getByLabel('Email').fill(EMAIL);
await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/child|today/, { timeout: 30000 });

// Caregiver screens ask for the password after a full page load.
async function go(path) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState('networkidle');
  const unlock = page.getByRole('button', { name: 'Caregiver unlock', exact: true });
  if (await unlock.isVisible().catch(() => false)) {
    await unlock.click();
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
}

async function dismissBanner() {
  const banner = page.getByText('Reward alerts are blocked', { exact: false });
  if (await banner.isVisible().catch(() => false)) {
    await banner.locator('xpath=ancestor::*[.//button][1]').getByRole('button').first().click();
  }
}

// The child view (child-home.webp) comes from the e2e run instead:
// e2e/screenshots/phone/child-tiles-home.png, cropped to the first screen.
// Timer last, so its running
// countdown pill does not show up on the other screens.
const steps = {
  today: async () => {
    await go('/today/');
    await dismissBanner();
  },
  chips: () => go('/chips/'),
  'first-then': () => go('/first-then/'),
  stories: () => go('/stories/'),
  timer: async () => {
    await go('/timer/');
    await page.getByRole('button', { name: '5 min', exact: true }).click();
    await page.getByRole('button', { name: /start/i }).click();
    await page.waitForTimeout(4000);
  },
};

for (const [name, run] of Object.entries(steps)) {
  if (only && only !== name) continue;
  try {
    await run();
    await shot(name);
  } catch (e) {
    console.error('failed', name, e.message.split('\n')[0]);
  }
}
await browser.close();
