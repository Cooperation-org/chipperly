import Link from 'next/link';
import type { Category, Post } from '../payload-types';
import { Crumbs } from './Crumbs';
import { PostCard } from './PostCard';

type Props = {
  title: string;
  intro: string;
  posts: Post[];
  categories: Category[];
  activeCategory?: string;
  page: number;
  totalPages: number;
  crumbs: [string, string?][];
};

export function BlogList({ title, intro, posts, categories, activeCategory, page, totalPages, crumbs }: Props) {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <Crumbs items={crumbs} />
          <p className="eyebrow">Blog</p>
          <h1>{title}</h1>
          <p className="lede">{intro}</p>
          {categories.length > 0 && (
            <nav aria-label="Categories" className="chips-row">
              <Link className="pill" href="/blog" aria-current={!activeCategory ? 'page' : undefined}>
                All
              </Link>
              {categories.map((c) => (
                <Link key={c.id} className="pill" href={`/blog/category/${c.slug}`} aria-current={activeCategory === c.slug ? 'page' : undefined}>
                  {c.title}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          {posts.length ? (
            <div className="post-grid">
              {posts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : (
            <p className="empty">No posts here yet. Check back soon.</p>
          )}
          {totalPages > 1 && (
            <nav className="pager" aria-label="Pagination">
              {page > 1 ? (
                <Link className="btn btn-ghost" href={page === 2 ? '/blog' : `/blog/page/${page - 1}`} rel="prev">
                  Newer posts
                </Link>
              ) : (
                <span />
              )}
              {page < totalPages ? (
                <Link className="btn btn-ghost" href={`/blog/page/${page + 1}`} rel="next">
                  Older posts
                </Link>
              ) : null}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
