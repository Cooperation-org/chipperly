import { notFound } from 'next/navigation';
import { BlogList } from '../../../../../components/BlogList';
import { JsonLd } from '../../../../../components/JsonLd';
import { getCategories } from '../../../../../lib/blog';
import { breadcrumbs } from '../../../../../lib/jsonld';
import { getCategory, payload } from '../../../../../lib/payload';
import { buildMetadata } from '../../../../../lib/seo';

export const revalidate = 3600;

// Empty list: nothing prebuilt, but each page is cached (ISR) after its first visit.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const cat = await getCategory((await params).slug);
  if (!cat) return {};
  return buildMetadata({ title: `${cat.title} articles`, description: cat.description, path: `/blog/category/${cat.slug}` });
}

export default async function CategoryPage({ params }: Props) {
  const cat = await getCategory((await params).slug);
  if (!cat) notFound();
  // ponytail: one page of up to 60 posts per category; paginate like
  // /blog/page/[n] once a category outgrows that.
  const [posts, categories] = await Promise.all([
    (await payload()).find({
      collection: 'posts',
      depth: 1,
      limit: 60,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' }, categories: { contains: cat.id } },
    }),
    getCategories(),
  ]);
  return (
    <>
      <BlogList
        title={cat.title}
        intro={cat.description || `Articles about ${cat.title.toLowerCase()} from the Chipperly team.`}
        posts={posts.docs}
        categories={categories}
        activeCategory={cat.slug ?? undefined}
        page={1}
        totalPages={1}
        crumbs={[['Blog', '/blog'], [cat.title]]}
      />
      <JsonLd graph={[breadcrumbs([['Blog', '/blog'], [cat.title, `/blog/category/${cat.slug}`]])]} />
    </>
  );
}
