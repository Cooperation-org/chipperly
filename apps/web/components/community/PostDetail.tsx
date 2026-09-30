'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  canEdit,
  formatPrice,
  parsePayload,
  payloadToActivityInput,
  payloadToStoryInput,
  sellingErrorMessage,
  startCheckout,
  usePost,
  type CommunityPost,
  type RoutinePayload,
  type StoryPayload,
} from '@/lib/data/community';
import { saveStory } from '@/lib/data/stories';
import { saveActivity } from '@/lib/data/activities';
import { useMediaUrl } from '@/lib/data/media';
import { newId } from '@/lib/ids';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { CommentList } from './CommentList';
import { PostEditor } from './PostEditor';
import { Byline, DeletePostButton, KIND_LABEL, LoadState, PostImage, ReportButton } from './PostCard';
import styles from './PostDetail.module.css';

function AudioClip({ mediaId, label }: { mediaId: string; label: string }) {
  const url = useMediaUrl(mediaId);
  // A shared voice recording has no transcript to caption; the aria-label names it instead.
  return url ? <audio className={styles.audio} controls src={url} aria-label={label} /> : null;
}

function depthOf(steps: RoutinePayload['steps'], step: RoutinePayload['steps'][number]): number {
  let depth = 0;
  let parent = step.parent_step_id;
  while (parent && depth < 8) {
    depth += 1;
    parent = steps.find((s) => s.id === parent)?.parent_step_id ?? null;
  }
  return depth;
}

function StorySnapshot({ story }: { story: StoryPayload }) {
  return (
    <ol className={styles.snapshot}>
      {story.pages.map((page, i) => (
        <li key={i} className={styles.page}>
          <p className={styles.pageNo}>Page {i + 1}</p>
          {page.photo_id ? <PostImage mediaId={page.photo_id} alt="" /> : null}
          <p className={styles.text}>
            {page.emoji ? <span aria-hidden="true">{page.emoji} </span> : null}
            {page.text}
          </p>
          {page.audio_id ? <AudioClip mediaId={page.audio_id} label={`Recording for page ${i + 1}`} /> : null}
        </li>
      ))}
    </ol>
  );
}

function RoutineSnapshot({ routine }: { routine: RoutinePayload }) {
  return (
    <ul className={styles.snapshot}>
      {routine.steps.map((step) => (
        <li key={step.id} className={styles.step} style={{ paddingInlineStart: `calc(var(--space-3) * ${depthOf(routine.steps, step)})` }}>
          {step.emoji ? <span aria-hidden="true">{step.emoji} </span> : null}
          {step.name}
          {step.duration_minutes ? <span className={styles.muted}> ({step.duration_minutes} min)</span> : null}
        </li>
      ))}
    </ul>
  );
}

function PostBody({ post, onChanged }: { post: CommunityPost; onChanged: () => void }) {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const [imported, setImported] = useState(false);
  const [editing, setEditing] = useState(false);
  const [buying, setBuying] = useState(false);
  const parsed = parsePayload(post.kind, post.payload);
  const media = [...(post.media ?? [])].sort((a, b) => a.position - b.position);
  const audio = post.include_audio ? media.find((m) => m.kind === 'audio') : undefined;
  const title = post.title?.trim() || (parsed?.kind === 'story' ? parsed.data.title : parsed?.kind === 'routine' ? parsed.data.name : '');

  async function importIt(): Promise<void> {
    if (!parsed || !profile) return;
    try {
      if (parsed.kind === 'story') await saveStory(payloadToStoryInput(parsed.data, profile.id));
      else await saveActivity(payloadToActivityInput(parsed.data, profile.id, newId));
      setImported(true);
      toast(parsed.kind === 'story' ? `Added to ${profile.name}'s stories.` : `Added to ${profile.name}'s routines.`);
    } catch {
      toast("Couldn't add that. Try again.");
    }
  }

  async function buy(): Promise<void> {
    setBuying(true);
    try {
      window.location.assign(await startCheckout(post.id));
    } catch (e) {
      toast(sellingErrorMessage(e));
      setBuying(false);
    }
  }

  return (
    <article className={styles.post}>
      <p className={styles.kind}>{KIND_LABEL[post.kind]}</p>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <Byline nickname={post.author.nickname} isSupport={post.author.is_support} avatarEmoji={post.author.avatar_emoji} when={post.created_at} />
      {editing ? (
        <PostEditor
          post={post}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : post.body ? (
        <p className={styles.text}>{post.body}</p>
      ) : null}
      {media
        .filter((m) => m.kind === 'image')
        .map((m) => (
          <PostImage key={m.media_id} mediaId={m.media_id} alt="" />
        ))}
      {audio ? <AudioClip mediaId={audio.media_id} label="Recording" /> : null}
      {parsed?.kind === 'story' ? <StorySnapshot story={parsed.data} /> : null}
      {parsed?.kind === 'routine' ? <RoutineSnapshot routine={parsed.data} /> : null}
      {!post.has_access && post.price ? (
        <p className={styles.muted}>This {KIND_LABEL[post.kind].toLowerCase()} costs {formatPrice(post.price)}. Buy it to add your own copy.</p>
      ) : null}
      <div className={styles.actions}>
        {!post.has_access && post.price ? (
          <Button loading={buying} onClick={() => void buy()}>
            Buy for {formatPrice(post.price)}
          </Button>
        ) : null}
        {post.has_access && parsed && profile ? (
          <Button disabled={imported} onClick={() => void importIt()}>
            {imported ? 'Added' : parsed.kind === 'story' ? `Add to ${profile.name}'s stories` : `Add to ${profile.name}'s routines`}
          </Button>
        ) : null}
        {canEdit(post.viewer) && !editing ? (
          <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
        <DeletePostButton post={post} onDeleted={() => router.replace('/community/')} />
        <ReportButton targetType="post" targetId={post.id} />
      </div>
    </article>
  );
}

/** One post, its shared story or routine, and its comments. Id comes from `?id=`. */
export function PostDetail() {
  const id = useSearchParams().get('id') ?? '';
  const { status, post, reload } = usePost(id);
  const returnedFromPayment = useSearchParams().get('purchased') === '1';
  const waitingForPayment = returnedFromPayment && post !== null && !post.has_access;

  // Stripe's webhook can land a moment after the buyer does: look again a few times. The
  // count lives in a ref because each look briefly unmounts the post and would reset it.
  const looks = useRef(0);
  useEffect(() => {
    if (!waitingForPayment || looks.current >= 6) return;
    const timer = setTimeout(() => {
      looks.current += 1;
      reload();
    }, 2500);
    return () => clearTimeout(timer);
  }, [waitingForPayment, reload]);

  return (
    <div className={styles.screen}>
      <PageHeader title="Community" backHref="/community/" compact />
      {id === '' ? (
        <EmptyState sentence="That post isn't here." />
      ) : (
        <LoadState status={status} onRetry={reload}>
          {post ? (
            <>
              {waitingForPayment ? <p role="status">Payment received. Unlocking your copy...</p> : null}
              <PostBody post={post} onChanged={reload} />
              <CommentList postId={post.id} />
            </>
          ) : null}
        </LoadState>
      )}
    </div>
  );
}
