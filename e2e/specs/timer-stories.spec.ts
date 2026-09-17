import { test, expect, type Page } from '@playwright/test';
import { expectNoOverflow, gotoTab, signUp, snap } from '../helpers';

test.describe.configure({ mode: 'serial' });

test.describe('timer and stories', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signUp(page, { name: 'Timer Tester' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('S13 timer: preset, start, pause, ring', async () => {
    await gotoTab(page, 'timer');
    await expectNoOverflow(page, 'S13 timer');
    await snap(page, 's13-timer');

    await page.getByRole('button', { name: '1 min', exact: true }).click();
    const ring = page.getByRole('button', { name: /^Timer, 1:00 remaining$/ });
    await expect(ring).toBeVisible();

    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Timer, .* remaining$/ }).click();
    const overlay = page.getByRole('dialog', { name: 'Timer' });
    await expect(overlay).toBeVisible();
    await expectNoOverflow(page, 'S14 timer full screen');
    await snap(page, 's14-timer-fullscreen');
    await page.getByRole('button', { name: 'Close timer', exact: true }).click();
    await expect(overlay).toBeHidden();
  });

  test('a running timer shows a pill on Today', async () => {
    await gotoTab(page, 'today');
    await expect(page.getByRole('button', { name: /^Timer, .* remaining$/ })).toBeVisible();
    await gotoTab(page, 'timer');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  });

  test('S16 stories: empty state with templates', async () => {
    await gotoTab(page, 'stories');
    await expect(page.getByText('No stories yet')).toBeVisible();
    for (const label of ['Haircut', 'Doctor visit', 'New place', 'Big day']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expectNoOverflow(page, 'S16 stories empty');
    await snap(page, 's16-stories-empty');
  });

  test('create Haircut story, edit, save', async () => {
    await page.getByRole('button', { name: 'Haircut', exact: true }).click();
    await page.waitForURL('**/story/edit/**');
    await expect(page.getByRole('heading', { name: 'Edit story', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Pages \(\d+\)/ })).toBeVisible();
    await expectNoOverflow(page, 'S18 edit story');
    await snap(page, 's18-edit-story');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('**/stories/');
    await expect(page.getByRole('button', { name: 'Getting a Haircut', exact: true })).toBeVisible();
  });

  test('S17 story viewer: open, next/prev, close', async () => {
    await page.getByRole('button', { name: 'Getting a Haircut', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Getting a Haircut' });
    await expect(viewer).toBeVisible();
    await expectNoOverflow(page, 'S17 story viewer');
    await snap(page, 's17-story-viewer');

    const next = viewer.getByRole('button', { name: 'Next page', exact: true });
    await next.click();
    await expect(viewer.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
    await viewer.getByRole('button', { name: 'Previous page', exact: true }).click();

    await viewer.getByRole('button', { name: 'Close story', exact: true }).click();
    await expect(viewer).toBeHidden();
  });

  test('duplicate a story via More', async () => {
    await page.getByRole('button', { name: 'More for Getting a Haircut', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Getting a Haircut copy', exact: true })).toBeVisible();
  });
});
