'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMediaUrl } from '@/lib/data/media';
import { canDelete, deletePost, formatPrice, toCard, type CommunityPost, type LoadStatus } from '@/lib/data/community';
import { toast } from '@/lib/toast';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { ReportSheet } from './ReportSheet';
import styles from './PostCard.module.css';

export const KIND_LABEL = { post: 'Post', story: 'Social story', routine: 'Routine' } as const;

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Byline({ nickname, isSupport, when }: { nickname: string; isSupport: boolean; when: number }) {
  return (
    <p className={styles.byline}>
      <span className={styles.nickname}>{nickname}</span>
      {isSupport ? <span className={styles.badge}>Support</span> : null}
      <span>{formatWhen(when)}</span>
    </p>
  );
}

export function PostImage({ mediaId, alt }: { mediaId: string; alt: string }) {
  const url = useMediaUrl(mediaId);
  return (
    <div className={styles.imageBox}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, blob or API URL */}
      {url ? <img className={styles.image} src={url} alt={alt} loading="lazy" /> : null}
    </div>
  );
}

/** Opens the ReportSheet for one post or comment. */
/** Anyone may READ the community; writing to it needs an account. */
export function useSignedIn(): boolean {
  return useSession().status === 'signed_in';
}

/** What a signed-out reader sees where a signed-in one gets a control. */
export function SignInToJoin({ what }: { what: string }) {
  return (
    <p className={styles.signIn}>
      <Link href="/">Sign in</Link> to {what}.
    </p>
  );
}

export function ReportButton({ targetType, targetId }: { targetType: 'post' | 'comment'; targetId: string }) {
  const sheet = useSheet();
  const signedIn = useSignedIn();
  // Reporting needs an account (the endpoint is rate-limited per user), so a
  // signed-out reader gets the way in rather than a button that would 401.
  if (!signedIn) {
    return (
      <Link className={styles.reportLink} href="/">
        Sign in to report
      </Link>
    );
  }
  return (
    <Button
      variant="ghost"
      icon="more"
      onClick={() => sheet.open(<ReportSheet target_type={targetType} target_id={targetId} />, { title: 'Report' })}
    >
      Report
    </Button>
  );
}

/** Delete for the author, Remove for a moderator on someone else's post. The API decides who gets `viewer`; the server re-checks on the call. */
export function DeletePostButton({ post, onDeleted }: { post: CommunityPost; onDeleted: () => void }) {
  const sheet = useSheet();
  if (!canDelete(post.viewer)) return null;
  const verb = post.viewer.is_mine ? 'Delete' : 'Remove';
  return (
    <Button
      variant="ghost"
      icon="trash"
      onClick={() =>
        sheet.open(
          <Confirm
            title={`${verb} this post?`}
            body={post.viewer.is_mine ? 'It disappears from the community.' : 'It disappears from the community for everyone.'}
            confirmLabel={verb}
            danger
            onCancel={sheet.close}
            onConfirm={() => {
              sheet.close();
              deletePost(post.id).then(onDeleted, () => toast("Couldn't do that. Try again."));
            }}
          />,
          { title: `${verb} post` },
        )
      }
    >
      {verb}
    </Button>
  );
}

/** Loading, offline and error views shared by the feed and the post page. */
export function LoadState({ status, onRetry, children }: { status: LoadStatus; onRetry: () => void; children: ReactNode }) {
  if (status === 'offline') {
    return <EmptyState picture={<Icon name="sync" size={48} />} sentence="You're offline. Community needs a connection." />;
  }
  if (status === 'error') {
    return (
      <EmptyState
        picture={<Icon name="sync" size={48} />}
        sentence="Couldn't load that. Check your connection and try again."
        actions={[
          <Button key="retry" onClick={onRetry}>
            Try again
          </Button>,
        ]}
      />
    );
  }
  if (status === 'loading') {
    return (
      <div className={styles.skeletons} role="status" aria-label="Loading">
        <Skeleton height={120} radius="lg" />
        <Skeleton height={120} radius="lg" />
        <Skeleton height={120} radius="lg" />
      </div>
    );
  }
  return <>{children}</>;
}

export function PostCard({ post, onDeleted }: { post: CommunityPost; onDeleted?: () => void }) {
  const card = toCard(post);
  const firstImage = card.image_ids[0];
  return (
    <article className={styles.card}>
      <Link href={`/community/post/?id=${card.id}`} className={styles.link}>
        <span className={styles.kind}>
          {KIND_LABEL[card.kind]}
          {post.price ? ` · ${formatPrice(post.price)}` : ''}
        </span>
        {card.title ? <h2 className={styles.title}>{card.title}</h2> : null}
        {card.excerpt ? <p className={styles.excerpt}>{card.excerpt}</p> : null}
        {firstImage ? <PostImage mediaId={firstImage} alt="" /> : null}
        {card.has_audio && post.include_audio ? (
          <span className={styles.audio}>
            <Icon name="speaker" size={20} /> Has a recording
          </span>
        ) : null}
        <Byline nickname={card.nickname} isSupport={card.is_support} when={card.created_at} />
      </Link>
      <div className={styles.actions}>
        <ReportButton targetType="post" targetId={card.id} />
        {onDeleted ? <DeletePostButton post={post} onDeleted={onDeleted} /> : null}
      </div>
    </article>
  );
}
