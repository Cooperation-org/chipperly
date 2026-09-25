/* eslint-disable @next/next/no-img-element */
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crumbs } from '../../../../components/Crumbs';
import { Faq } from '../../../../components/Faq';
import { ShareButtons, type ShareTarget } from '../../../../components/ShareButtons';
import { JsonLd } from '../../../../components/JsonLd';
import { PostCard } from '../../../../components/PostCard';
import { RichText } from '../../../../components/RichText';
import { formatDate, readingMinutes } from '../../../../lib/format';
import { breadcrumbs, faqPage, ORG_ID } from '../../../../lib/jsonld';
import { followRedirect, getPost, getSettings, payload } from '../../../../lib/payload';
import { buildMetadata, ogImageUrl } from '../../../../lib/seo';
import { abs } from '../../../../lib/site';
import type { Media, Post } from '../../../../payload-types';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };
type Byline = { id: number; name: string; role?: string | null; bio?: string | null; avatar?: Media | number | null };

export async function generateStaticParams() {
  const { docs } = await (await payload()).find({
    collection: 'posts',
    limit: 200,
    depth: 0,
    select: { slug: true },
    where: { _status: { equals: 'published' } },
  });
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) return {};
  return buildMetadata({
    title: post.meta?.title?.replace(/ \| Chipperly$/, '') || post.title,
    description: post.meta?.description || post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.meta?.image || post.heroImage,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    noindex: post.meta?.noindex,
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const [post, settings] = await Promise.all([getPost(slug), getSettings()]);
  if (!post) {
    await followRedirect(`/blog/${slug}`);
    notFound();
  }

  const hero = typeof post.heroImage === 'object' ? post.heroImage : null;
  const byline = (post.byline as Byline[] | undefined) ?? [];
  const cats = (post.categories ?? []).filter((c) => typeof c === 'object');
  const related = (post.relatedPosts ?? []).filter((p): p is Post => typeof p === 'object' && p._status === 'published');
  const minutes = readingMinutes(convertLexicalToPlaintext({ data: post.content }));
  const url = abs(`/blog/${post.slug}`);
  const faqs = post.faqs ?? [];
  const share = (settings.share ?? []) as ShareTarget[];

  return (
    <article>
      <header className="narrow article-head">
        <Crumbs items={[['Blog', '/blog'], [post.title]]} />
        {cats.map((c) => (
          <Link key={c.id} className="tag" href={`/blog/category/${c.slug}`} style={{ marginRight: 12 }}>
            {c.title}
          </Link>
        ))}
        <h1>{post.title}</h1>
        <p className="lede">{post.excerpt}</p>
        <p className="meta">
          {byline.length > 0 && <span>By {byline.map((a) => a.name).join(', ')}</span>}
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
          <span>{minutes} min read</span>
        </p>
      </header>

      {hero?.url && (
        <figure className="wrap article-hero" style={{ maxWidth: 1000 }}>
          <Image
            src={hero.sizes?.wide?.url || hero.url}
            alt={hero.alt}
            width={hero.sizes?.wide?.width || hero.width || 1600}
            height={hero.sizes?.wide?.height || hero.height || 900}
            sizes="(max-width: 1000px) 100vw, 1000px"
            priority
          />
        </figure>
      )}

      <div className="narrow">
        <RichText data={post.content} />

        <Faq items={faqs} title="Questions about this topic" />

        <ShareButtons targets={share} url={url} title={post.title} />

        {byline.map((a) => {
          const avatar = typeof a.avatar === 'object' ? a.avatar : null;
          return (
            <aside key={a.id} className="author-box" aria-label="About the author">
              {avatar?.url ? <img src={avatar.sizes?.card?.url || avatar.url} alt="" /> : <img src="/brand/mark.svg" alt="" />}
              <div>
                <strong>{a.name}</strong>
                {a.role ? <span className="muted">, {a.role}</span> : null}
                {a.bio ? <p>{a.bio}</p> : null}
              </div>
            </aside>
          );
        })}
      </div>

      {related.length > 0 && (
        <section className="wrap related" aria-labelledby="related-title">
          <h2 id="related-title">Keep reading</h2>
          <div className="post-grid">
            {related.slice(0, 3).map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
      <div style={{ height: 96 }} />

      <JsonLd
        graph={[
          {
            '@type': 'BlogPosting',
            '@id': `${url}#article`,
            mainEntityOfPage: url,
            url,
            headline: post.title,
            description: post.meta?.description || post.excerpt,
            image: ogImageUrl(post.meta?.image || post.heroImage, post.title),
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            wordCount: minutes * 230,
            inLanguage: 'en-US',
            articleSection: cats.map((c) => c.title),
            author: byline.length
              ? byline.map((a) => ({ '@type': 'Person', name: a.name, ...(a.role ? { jobTitle: a.role } : {}) }))
              : { '@id': ORG_ID },
            publisher: { '@id': ORG_ID },
          },
          breadcrumbs([
            ['Blog', '/blog'],
            [post.title, `/blog/${post.slug}`],
          ]),
          ...(faqs.length ? [faqPage(faqs, url)] : []),
        ]}
      />
    </article>
  );
}
