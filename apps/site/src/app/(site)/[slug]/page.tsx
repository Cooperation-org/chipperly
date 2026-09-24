import { notFound } from 'next/navigation';
import { Crumbs } from '../../../components/Crumbs';
import { JsonLd } from '../../../components/JsonLd';
import { RichText } from '../../../components/RichText';
import { breadcrumbs } from '../../../lib/jsonld';
import { followRedirect, getPage } from '../../../lib/payload';
import { buildMetadata } from '../../../lib/seo';

// Pages written in the CMS (Pages collection), e.g. /press or /resources.
export const revalidate = 3600;

// Empty list: nothing prebuilt, but each page is cached (ISR) after its first visit.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const page = await getPage((await params).slug);
  if (!page) return {};
  return buildMetadata({
    title: page.meta?.title?.replace(/ \| Chipperly$/, '') || page.title,
    description: page.meta?.description || page.intro,
    path: `/${page.slug}`,
    image: page.meta?.image,
    noindex: page.meta?.noindex,
  });
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) {
    await followRedirect(`/${slug}`);
    notFound();
  }
  return (
    <>
      <section className="page-hero">
        <div className="narrow">
          <Crumbs items={[[page.title]]} />
          <h1>{page.title}</h1>
          {page.intro ? <p className="lede">{page.intro}</p> : null}
        </div>
      </section>
      <div className="narrow" style={{ paddingBottom: 96 }}>
        <RichText data={page.content} />
      </div>
      <JsonLd graph={[breadcrumbs([[page.title, `/${page.slug}`]])]} />
    </>
  );
}
