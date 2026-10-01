import { expect, test, type Page } from '@playwright/test';
import { signUp } from '../helpers';

// 1x1 PNG. The API (Openverse) is stubbed, so the real server only sees the signed-in session.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const ATTRIBUTION = '"Red fox" by Jo is licensed under CC BY 4.0.';
const HIT = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Red fox',
  creator: 'Jo',
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  thumbnail: 'https://images.example.test/fox-thumb.png',
  attribution: ATTRIBUTION,
  landing_url: 'https://example.org/fox',
  width: 1,
  height: 1,
};

async function stubImageApi(page: Page, enabled: boolean): Promise<void> {
  await page.route('**/api/images/status', (route) => route.fulfill({ json: { enabled } }));
  await page.route('**/api/images/search**', (route) =>
    route.fulfill({ json: { results: [HIT], total: 1, page: 1, page_count: 1 } }),
  );
  await page.route('**/api/images/import', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: {
        'X-Image-Attribution': encodeURIComponent(ATTRIBUTION),
        'X-Image-Source': encodeURIComponent(HIT.landing_url),
      },
      body: PNG,
    }),
  );
  // The thumbnail host is fake; answer with the same PNG so the grid has an image.
  await page.route('https://images.example.test/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
}

async function openActivityPicker(page: Page): Promise<void> {
  await expect(page.getByRole('checkbox', { name: /^Wake Up,/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create a new activity', exact: true }).click();
  await page.waitForURL('**/activity/edit/**');
  await page.getByLabel('Name', { exact: true }).fill('Fox walk');
  await page.getByRole('button', { name: /^Picture/ }).click();
}

test.describe('image search', () => {
  test('search, pick a result, see the picture and its credit', async ({ page }) => {
    await stubImageApi(page, true);
    await signUp(page, { name: 'Image Searcher' });
    await openActivityPicker(page);

    await page.getByRole('button', { name: 'Search images', exact: true }).click();
    // The box starts with the activity name; searching waits for Enter or the button.
    const box = page.getByRole('searchbox', { name: 'Search for an image' });
    await expect(box).toHaveValue('Fox walk');
    await box.fill('red fox');
    await box.press('Enter');

    await expect(page.getByText('1 image found. Tap one to use it.')).toBeVisible();
    await expect(page.getByText('CC BY 4.0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Red fox/ }).click();

    await expect(page.getByText('Picture added.')).toBeVisible();
    await expect(page.getByText(ATTRIBUTION)).toBeVisible();
    await expect(page.locator('div[class*="FormRow_panel"] img[alt="Fox walk"]')).toBeVisible();
  });

  test('the button is absent when the server has image search off', async ({ page }) => {
    await stubImageApi(page, false);
    await signUp(page, { name: 'No Search' });
    await openActivityPicker(page);

    await expect(page.getByRole('button', { name: 'Photo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search images', exact: true })).toHaveCount(0);
  });
});
