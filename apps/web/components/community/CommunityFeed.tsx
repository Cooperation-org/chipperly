'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFeed, type PostKind } from '@/lib/data/community';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { LoadState, PostCard } from './PostCard';
import styles from './CommunityFeed.module.css';

const FILTERS: { value: 'all' | PostKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'story', label: 'Stories' },
  { value: 'routine', label: 'Routines' },
];

function toFilter(value: string): 'all' | PostKind {
  return FILTERS.find((f) => f.value === value)?.value ?? 'all';
}

/** The public feed. Pages on demand with a Load more button, never on scroll. */
export function CommunityFeed() {
  const [filter, setFilter] = useState<'all' | PostKind>('all');
  const feed = useFeed(filter === 'all' ? undefined : filter);

  return (
    <div className={styles.screen}>
      <PageHeader title="Community" compact />
      <div className={styles.toolbar}>
        <Segmented items={FILTERS} value={filter} onChange={(v) => setFilter(toFilter(v))} label="Show" />
        <Link href="/community/new/" className={styles.newLink}>
          <Icon name="plus" size={20} /> New post
        </Link>
      </div>
      <LoadState status={feed.status} onRetry={feed.reload}>
        {feed.posts.length === 0 ? (
          <EmptyState picture={<Icon name="users" size={48} />} sentence="Nothing here yet. Be the first to share." />
        ) : (
          <>
            <ul className={styles.list}>
              {feed.posts.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} />
                </li>
              ))}
            </ul>
            {feed.moreFailed ? (
              <p className={styles.error} role="alert">
                Couldn&apos;t load more. Try again.
              </p>
            ) : null}
            {feed.hasMore ? (
              <Button variant="secondary" fullWidth loading={feed.loadingMore} onClick={() => void feed.loadMore()}>
                Load more
              </Button>
            ) : null}
          </>
        )}
      </LoadState>
    </div>
  );
}
