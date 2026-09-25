import { payload } from '../../lib/payload';
import { abs } from '../../lib/site';

// Hand-written instead of app/sitemap.ts so the XML can carry an
// <?xml-stylesheet?> line: browsers show /sitemap.xsl (a styled, grouped
// page), crawlers read the same standard XML and ignore the stylesheet.
export const revalidate = 3600;

type Entry = { loc: string; title: string; lastmod?: string; changefreq?: string; priority: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The page title rides in an XML comment: crawlers ignore it, /sitemap.xsl shows it.
const comment = (s: string) => `<!--${s.replace(/-{2,}/g, '-').replace(/-$/, '')}-->`;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

export async function GET() {
  const p = await payload();
  const visible = { _status: { equals: 'published' }, 'meta.noindex': { not_equals: true } } as const;
  const [posts, pages, categories] = await Promise.all([
    p.find({ collection: 'posts', limit: 1000, depth: 0, sort: '-publishedAt', select: { slug: true, title: true, updatedAt: true }, where: visible }),
    p.find({ collection: 'pages', limit: 1000, depth: 0, sort: 'slug', select: { slug: true, title: true, updatedAt: true }, where: visible }),
    p.find({ collection: 'categories', limit: 200, depth: 0, sort: 'slug', select: { slug: true, title: true, updatedAt: true } }),
  ]);
  const newest = posts.docs.reduce((max, d) => (d.updatedAt > max ? d.updatedAt : max), '2026-09-25');

  const entries: Entry[] = [
    { loc: abs('/'), title: 'Home', lastmod: day(newest), changefreq: 'weekly', priority: 1 },
    { loc: abs('/features'), title: 'Features', changefreq: 'monthly', priority: 0.8 },
    { loc: abs('/about'), title: 'Our story', changefreq: 'monthly', priority: 0.6 },
    { loc: abs('/blog'), title: 'Blog', lastmod: day(newest), changefreq: 'weekly', priority: 0.7 },
    ...posts.docs.map((d) => ({ loc: abs(`/blog/${d.slug}`), title: d.title, lastmod: day(d.updatedAt), priority: 0.6 })),
    ...categories.docs.map((d) => ({ loc: abs(`/blog/category/${d.slug}`), title: d.title, lastmod: day(d.updatedAt), priority: 0.4 })),
    ...pages.docs.map((d) => ({ loc: abs(`/${d.slug}`), title: d.title, lastmod: day(d.updatedAt), priority: 0.5 })),
  ];

  const urls = entries
    .map((e) =>
      [
        '  <url>',
        `    ${comment(e.title)}`,
        `    <loc>${esc(e.loc)}</loc>`,
        e.lastmod && `    <lastmod>${e.lastmod}</lastmod>`,
        e.changefreq && `    <changefreq>${e.changefreq}</changefreq>`,
        `    <priority>${e.priority.toFixed(1)}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
