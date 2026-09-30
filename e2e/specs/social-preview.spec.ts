import { test, expect, type Page } from '@playwright/test';

/**
 * A page's `openGraph` REPLACES the root layout's instead of merging into it, so every
 * public page that declares one has to carry the image itself. It shipped once without
 * that: og:image was missing everywhere and only twitter:image survived, so shared links
 * had no preview on anything but Twitter. Nothing caught it but reading the live HTML.
 *
 * These are static pages, so this reads the markup rather than driving the UI.
 */

/**
 * The content of a <meta> by property (Open Graph) or name (Twitter), or null when the
 * tag is absent. Counting first matters: an absent tag is a real answer here (a page with
 * no robots meta is indexable), and getAttribute on a locator that matches nothing waits
 * for the full timeout instead of saying "not there".
 */
async function meta(page: Page, key: string): Promise<string | null> {
  const tag = page.locator(`meta[property="${key}"], meta[name="${key}"]`).first();
  return (await tag.count()) === 0 ? null : tag.getAttribute('content');
}

const PAGES_WITH_THEIR_OWN_OG = ['/', '/sign-up/', '/privacy/', '/terms/', '/community/'];

test.describe('social preview', () => {
  for (const path of PAGES_WITH_THEIR_OWN_OG) {
    test(`${path} carries the preview image`, async ({ page }) => {
      await page.goto(path);

      const image = await meta(page, 'og:image');
      expect(image, `${path} is missing og:image`).toBeTruthy();
      expect(image).toContain('/og/og-image.png');

      // Twitter reads its own tag and was the only one that used to work here.
      expect(await meta(page, 'twitter:image')).toContain('/og/og-image.png');
      expect(await meta(page, 'twitter:card')).toBe('summary_large_image');

      // A preview needs a title and something to say, not just a picture.
      expect(await meta(page, 'og:title')).toBeTruthy();
      expect(await meta(page, 'og:description')).toBeTruthy();
    });
  }

  test('the image is really served, at the documented size', async ({ page, request }) => {
    await page.goto('/');
    const absolute = await meta(page, 'og:image');
    expect(absolute).toBeTruthy();

    // Assert against the test server rather than the absolute URL: metadataBase is built
    // from NEXT_PUBLIC_SITE_ORIGIN, which is the real domain in production and not this host.
    const res = await request.get('/og/og-image.png');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');

    // Scrapers want 1200x630; the generator script produces exactly that.
    expect(await meta(page, 'og:image:width')).toBe('1200');
    expect(await meta(page, 'og:image:height')).toBe('630');
  });

  test('the community feed is indexable and the post shell is not', async ({ page }) => {
    // Public reading is the point of the feed, so it must not be noindex. The post page
    // is one static shell for every post (?id=), so indexing it would index an empty page.
    await page.goto('/community/');
    expect(await meta(page, 'robots') ?? '').not.toContain('noindex');

    await page.goto('/community/post/?id=00000000-0000-0000-0000-000000000000');
    expect(await meta(page, 'robots')).toContain('noindex');
  });
});
