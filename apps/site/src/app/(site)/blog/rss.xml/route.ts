import { payload } from '../../../../lib/payload';
import { abs, SITE_NAME } from '../../../../lib/site';
import { BLOG_INTRO } from '../../../../lib/blog';

export const revalidate = 3600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const { docs } = await (await payload()).find({
    collection: 'posts',
    limit: 50,
    depth: 0,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' }, 'meta.noindex': { not_equals: true } },
  });
  const items = docs
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(`/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${abs(`/blog/${p.slug}`)}</guid>
      <description>${esc(p.excerpt)}</description>
      ${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ''}
    </item>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} blog</title>
    <link>${abs('/blog')}</link>
    <description>${esc(BLOG_INTRO)}</description>
    <language>en-us</language>
    <atom:link href="${abs('/blog/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
