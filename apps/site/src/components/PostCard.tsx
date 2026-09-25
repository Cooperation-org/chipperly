/* eslint-disable @next/next/no-img-element */
import Image from 'next/image';
import Link from 'next/link';
import type { Post } from '../payload-types';
import { formatDate } from '../lib/format';

export function PostCard({ post }: { post: Post }) {
  const img = typeof post.heroImage === 'object' ? post.heroImage : null;
  const cat = post.categories?.find((c) => typeof c === 'object');
  const src = img?.url;
  return (
    <Link href={`/blog/${post.slug}`} className="post-card">
      <div className="post-card-img">
        {src ? (
          <Image src={src} alt={img?.alt ?? ''} width={img?.width ?? 1600} height={img?.height ?? 900} sizes="(max-width: 700px) 100vw, 380px" />
        ) : (
          <img className="placeholder" src="/brand/mark.svg" alt="" />
        )}
      </div>
      <div className="post-card-body">
        {cat && typeof cat === 'object' ? <span className="tag">{cat.title}</span> : null}
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <span className="meta">
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
        </span>
      </div>
    </Link>
  );
}
