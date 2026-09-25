import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

// Chromium's fake microphone (a steady tone) with the permission already granted.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
});

/** Record a story page in your own voice; the viewer then plays it instead of the device's voice. */
test.describe('story page in your own voice', () => {
  let page: Page;

  test.beforeAll(async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium has a fake microphone');
    page = await browser.newPage();
    await signUp(page, { name: 'Voice Tester' });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('record page 1, save, and it uploads as audio', async () => {
    await gotoTab(page, 'stories');
    await page.getByRole('button', { name: 'Haircut', exact: true }).click();
    await page.waitForURL('**/story/edit/**');

    await page.getByRole('button', { name: 'Record your voice for page 1', exact: true }).click();
    await expect(page.getByText('Recording…')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove voice', exact: true })).toBeVisible();
    await expect(page.getByLabel('Your voice for page 1')).toBeVisible();
    await expectNoOverflow(page, 'S18 story page with a recorded voice');
    await snap(page, 's18-story-voice');

    const uploaded = page.waitForResponse((res) => res.url().endsWith('/api/media') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/stories/');
    const res = await uploaded;
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { status: string }).status).toBe('ready');
  });

  test('the viewer offers "Listen" on the recorded page, "Read aloud" on the others', async () => {
    await page.getByRole('button', { name: 'Getting a Haircut', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Getting a Haircut' });
    await expect(viewer.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Close story', exact: true }).click();
  });
});
