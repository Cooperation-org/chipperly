import { AUDIENCES, CARE_TEAM, FAQS, TOOLS } from '../../lib/content';
import { formatDate } from '../../lib/format';
import { lexicalToMarkdown } from '../../lib/lexicalMarkdown';
import { LLMS_INTRO } from '../../lib/llms';
import { payload } from '../../lib/payload';
import { abs } from '../../lib/site';

// llms-full.txt: the whole public site as one Markdown file, so an AI
// assistant can read everything in a single fetch. Refreshed on every save
// (lib/revalidate.ts) and at most an hour old otherwise.
export const revalidate = 3600;

const faqMd = (faqs: { question: string; answer: string }[]) =>
  faqs.length ? `\n\n### Frequently asked questions\n\n${faqs.map((f) => `**${f.question}**\n\n${f.answer}`).join('\n\n')}` : '';

export async function GET() {
  const p = await payload();
  const visible = { _status: { equals: 'published' }, 'meta.noindex': { not_equals: true } } as const;
  const [posts, pages] = await Promise.all([
    p.find({ collection: 'posts', limit: 500, depth: 1, sort: '-publishedAt', where: visible }),
    p.find({ collection: 'pages', limit: 200, depth: 1, sort: 'title', where: visible }),
  ]);

  const site = [
    `## Features (${abs('/features')})`,
    TOOLS.map((t) => `### ${t.title}\n\n${t.long}`).join('\n\n'),
    `### For the whole care team\n\n${CARE_TEAM.map((c) => `- **${c.title}**: ${c.text}`).join('\n')}`,
    `### Frequently asked questions\n\n${FAQS.map((f) => `**${f.question}**\n\n${f.answer}`).join('\n\n')}`,
    `## About (${abs('/about')})`,
    'Chipperly was created by Taymar Pixleysmith, Founder & CEO, a mom who could not find a single app that brought all the visual support tools her son Benny needed into one place. Traditional visual supports are low-tech, need crafting skills and pieces get lost; the apps she tried were expensive and each solved only one or two pieces of the puzzle. Chipperly puts every tool in one app shared with the whole care team.',
    `### Who it is for\n\n${AUDIENCES.map((a) => `- **${a.title}**: ${a.text}`).join('\n')}`,
  ].join('\n\n');

  const blog = posts.docs
    .map((post) => {
      const cats = (post.categories ?? []).flatMap((c) => (typeof c === 'object' ? [c.title] : []));
      const head = [
        `## ${post.title}`,
        `URL: ${abs(`/blog/${post.slug}`)}`,
        post.publishedAt ? `Published: ${formatDate(post.publishedAt)}` : '',
        cats.length ? `Categories: ${cats.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('  \n');
      return `${head}\n\n> ${post.excerpt}\n\n${lexicalToMarkdown(post.content, abs)}${faqMd(post.faqs ?? [])}`;
    })
    .join('\n\n---\n\n');

  const extra = pages.docs
    .map((page) => `## ${page.title}\n\nURL: ${abs(`/${page.slug}`)}\n\n${page.intro ? `${page.intro}\n\n` : ''}${lexicalToMarkdown(page.content, abs)}${faqMd(page.faqs ?? [])}`)
    .join('\n\n---\n\n');

  const body = [LLMS_INTRO.trim(), site, blog && `# Blog\n\n${blog}`, extra && `# Pages\n\n${extra}`, '## Contact\n\ninfo@chipperlyapp.com']
    .filter(Boolean)
    .join('\n\n');
  return new Response(`${body}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
