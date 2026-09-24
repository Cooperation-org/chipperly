import { BlogList } from '../../../components/BlogList';
import { JsonLd } from '../../../components/JsonLd';
import { BLOG_INTRO, BLOG_TITLE, getCategories } from '../../../lib/blog';
import { breadcrumbs, ORG_ID } from '../../../lib/jsonld';
import { getPosts } from '../../../lib/payload';
import { buildMetadata } from '../../../lib/seo';
import { abs } from '../../../lib/site';

export const revalidate = 3600;

export const metadata = buildMetadata({ title: `Blog: ${BLOG_TITLE}`, description: BLOG_INTRO, path: '/blog' });

export default async function Blog() {
  const [posts, categories] = await Promise.all([getPosts(), getCategories()]);
  return (
    <>
      <BlogList title={BLOG_TITLE} intro={BLOG_INTRO} posts={posts.docs} categories={categories} page={1} totalPages={posts.totalPages} crumbs={[['Blog']]} />
      <JsonLd
        graph={[
          {
            '@type': 'Blog',
            '@id': abs('/blog#blog'),
            url: abs('/blog'),
            name: 'Chipperly blog',
            description: BLOG_INTRO,
            publisher: { '@id': ORG_ID },
            blogPost: posts.docs.map((p) => ({
              '@type': 'BlogPosting',
              headline: p.title,
              url: abs(`/blog/${p.slug}`),
              datePublished: p.publishedAt,
            })),
          },
          breadcrumbs([['Blog', '/blog']]),
        ]}
      />
    </>
  );
}
