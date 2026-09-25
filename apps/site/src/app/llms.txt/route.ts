import { payload } from '../../lib/payload';
import { abs } from '../../lib/site';
import { LLMS_INTRO } from '../../lib/llms';

// llms.txt (https://llmstxt.org): a plain summary for AI assistants, with
// the live list of blog posts appended.
export const revalidate = 3600;

export async function GET() {
  const { docs } = await (await payload()).find({
    collection: 'posts',
    limit: 100,
    depth: 0,
    sort: '-publishedAt',
    select: { title: true, slug: true, excerpt: true },
    where: { _status: { equals: 'published' }, 'meta.noindex': { not_equals: true } },
  });
  const posts = docs.length
    ? `\n## Blog posts\n\n${docs.map((p) => `- [${p.title}](${abs(`/blog/${p.slug}`)}): ${p.excerpt}`).join('\n')}\n`
    : '';
  return new Response(`${LLMS_INTRO}${posts}\n## Contact\n\ninfo@chipperlyapp.com\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
