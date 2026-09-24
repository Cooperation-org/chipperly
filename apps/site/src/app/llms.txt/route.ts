import { payload } from '../../lib/payload';
import { abs } from '../../lib/site';

// llms.txt (https://llmstxt.org): a plain summary for AI assistants, with
// the live list of blog posts appended.
export const revalidate = 3600;

const INTRO = `# Chipperly

> Visual supports app for neurodivergent individuals and their families. Visual
> schedules, timers, chip boards, first-then boards and social stories in one
> dashboard, shareable with a whole care team.

Chipperly is made by Chipperly LLC, founded in Tucson, Arizona, by Taymar
Pixleysmith. It was built after she watched her son struggle with everyday
routines and transitions, and found that existing tools were low-tech,
expensive, or each solved only one piece of the problem.

The product replaces three or four separate apps or laminated paper tools:

- **Visual schedule**: a picture-based breakdown of the day, with routines
  broken into steps.
- **Chip board**: earn chips for positive behaviors and redeem them for
  customizable rewards, including screen time.
- **Visual timer**: a countdown that makes the passage of time concrete and
  predictable, easing transitions.
- **First-Then board**: pairs a task with the reward that follows it.
- **Social stories**: short picture stories that prepare someone for an
  upcoming event.

It is multi-user (family, teachers and therapists share one household), has a
PIN-locked child mode for shared devices, read-only share links, and works
offline in the browser on phones, tablets and computers.

## Pages

- [Home](${abs('/')}): What Chipperly is, with screens from the app.
- [Features](${abs('/features')}): The visual support tools in detail, plus FAQ.
- [About](${abs('/about')}): The story behind Chipperly.
- [Blog](${abs('/blog')}): Articles on visual supports and routines.
`;

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
  return new Response(`${INTRO}${posts}\n## Contact\n\ninfo@chipperlyapp.com\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
