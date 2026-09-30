'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatJoined, postCountLabel, useMyNickname, useProfilePosts } from '@/lib/data/community';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar } from './Avatar';
import { LoadState, PostCard, ReportButton, SignInToJoin, useSignedIn } from './PostCard';
import styles from './CommunityProfile.module.css';

/** One person's public profile and posts. The nickname comes from `?name=`. Readable with no account. */
export function CommunityProfile() {
  const name = useSearchParams().get('name') ?? '';
  const signedIn = useSignedIn();
  const mine = useMyNickname(signedIn);
  const list = useProfilePosts(name);
  const { profile } = list;
  const isMe = profile !== null && mine !== null && mine.toLowerCase() === profile.nickname.toLowerCase();

  return (
    <div className={styles.screen}>
      <PageHeader title="Community" backHref="/community/" compact />
      {name === '' ? (
        <EmptyState picture={<Icon name="users" size={48} />} sentence="That person isn't here." />
      ) : list.status === 'not_found' ? (
        <EmptyState picture={<Icon name="users" size={48} />} sentence="That person isn't here. The name may have been typed wrong." />
      ) : (
        <LoadState status={list.status} onRetry={list.reload}>
          {profile ? (
            <>
              <section className={styles.card} aria-labelledby="profile-name">
                <div className={styles.top}>
                  <Avatar nickname={profile.nickname} emoji={profile.avatar_emoji} size="lg" />
                  <div className={styles.who}>
                    <h2 id="profile-name" className={styles.nickname}>
                      {profile.nickname}
                    </h2>
                    {profile.is_support ? <span className={styles.badge}>Support</span> : null}
                  </div>
                </div>
                {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
                <p className={styles.meta}>
                  Joined {formatJoined(profile.created_at)} &middot; {postCountLabel(profile.post_count)}
                </p>
                <div className={styles.actions}>
                  {isMe ? (
                    <Link href="/settings/community/" className={styles.editLink}>
                      Edit your profile
                    </Link>
                  ) : signedIn ? (
                    <ReportButton targetType="profile" targetNickname={profile.nickname} />
                  ) : (
                    <>
                      <SignInToJoin what="share your own" />
                      <ReportButton targetType="profile" targetNickname={profile.nickname} />
                    </>
                  )}
                </div>
              </section>

              {list.posts.length === 0 ? (
                <EmptyState picture={<Icon name="users" size={48} />} sentence={`${profile.nickname} hasn't shared anything yet.`} />
              ) : (
                <>
                  <ul className={styles.list}>
                    {list.posts.map((post) => (
                      <li key={post.id}>
                        <PostCard post={post} onDeleted={() => list.remove(post.id)} />
                      </li>
                    ))}
                  </ul>
                  {list.moreFailed ? (
                    <p className={styles.error} role="alert">
                      Couldn&apos;t load more. Try again.
                    </p>
                  ) : null}
                  {list.hasMore ? (
                    <Button variant="secondary" fullWidth loading={list.loadingMore} onClick={() => void list.loadMore()}>
                      Load more
                    </Button>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </LoadState>
      )}
    </div>
  );
}
