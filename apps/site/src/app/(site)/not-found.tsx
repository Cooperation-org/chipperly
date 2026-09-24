import Link from 'next/link';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <section className="wrap not-found">
      <p className="eyebrow">404</p>
      <h1>We couldn&rsquo;t find that page</h1>
      <p className="lede" style={{ marginInline: 'auto', marginTop: 20 }}>
        It may have moved, or the link has a typo.
      </p>
      <div className="hero-actions">
        <Link className="btn btn-primary" href="/">
          Go to the home page
        </Link>
        <Link className="btn btn-ghost" href="/blog">
          Read the blog
        </Link>
      </div>
    </section>
  );
}
