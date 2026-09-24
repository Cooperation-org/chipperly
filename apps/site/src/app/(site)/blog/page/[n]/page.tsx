import { notFound, permanentRedirect } from 'next/navigation';
import { BlogList } from '../../../../../components/BlogList';
import { BLOG_INTRO, BLOG_TITLE, getCategories } from '../../../../../lib/blog';
import { getPosts } from '../../../../../lib/payload';
import { buildMetadata } from '../../../../../lib/seo';

export const revalidate = 3600;

// Empty list: nothing prebuilt, but each page is cached (ISR) after its first visit.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Props) {
  const { n } = await params;
  return buildMetadata({ title: `Blog, page ${n}`, description: BLOG_INTRO, path: `/blog/page/${n}` });
}

export default async function BlogPage({ params }: Props) {
  const page = Number((await params).n);
  if (!Number.isInteger(page) || page < 1) notFound();
  if (page === 1) permanentRedirect('/blog');
  const [posts, categories] = await Promise.all([getPosts({ page }), getCategories()]);
  if (page > posts.totalPages) notFound();
  return (
    <BlogList
      title={BLOG_TITLE}
      intro={BLOG_INTRO}
      posts={posts.docs}
      categories={categories}
      page={page}
      totalPages={posts.totalPages}
      crumbs={[['Blog', '/blog'], [`Page ${page}`]]}
    />
  );
}
