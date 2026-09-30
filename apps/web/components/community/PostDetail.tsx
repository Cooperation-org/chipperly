'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  deletePost,
  isMine,
  parsePayload,
  payloadToActivityInput,
  payloadToStoryInput,
  useMyNickname,
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
import { Byline, KIND_LABEL, LoadState, PostImage, ReportButton } from './PostCard';
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

function PostBody({ post }: { post: CommunityPost }) {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const myNickname = useMyNickname();
  const [imported, setImported] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function remove(): Promise<void> {
    setDeleting(true);
    try {
      await deletePost(post.id);
      router.replace('/community/');
    } catch {
      setDeleting(false);
      toast("Couldn't delete that post. Try again.");
    }
  }

  return (
    <article className={styles.post}>
      <p className={styles.kind}>{KIND_LABEL[post.kind]}</p>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <Byline nickname={post.author.nickname} isSupport={post.author.is_support} when={post.created_at} />
      {post.body ? <p className={styles.text}>{post.body}</p> : null}
      {media
        .filter((m) => m.kind === 'image')
        .map((m) => (
          <PostImage key={m.media_id} mediaId={m.media_id} alt="" />
        ))}
      {audio ? <AudioClip mediaId={audio.media_id} label="Recording" /> : null}
      {parsed?.kind === 'story' ? <StorySnapshot story={parsed.data} /> : null}
      {parsed?.kind === 'routine' ? <RoutineSnapshot routine={parsed.data} /> : null}
      <div className={styles.actions}>
        {parsed && profile ? (
          <Button disabled={imported} onClick={() => void importIt()}>
            {imported ? 'Added' : parsed.kind === 'story' ? `Add to ${profile.name}'s stories` : `Add to ${profile.name}'s routines`}
          </Button>
        ) : null}
        {isMine(post.author, myNickname) ? (
          <Button variant="danger" icon="trash" loading={deleting} onClick={() => void remove()}>
            Delete post
          </Button>
        ) : null}
        <ReportButton targetType="post" targetId={post.id} />
      </div>
    </article>
  );
}

/** One post, its shared story or routine, and its comments. Id comes from `?id=`. */
export function PostDetail() {
  const id = useSearchParams().get('id') ?? '';
  const { status, post, reload } = usePost(id);
  return (
    <div className={styles.screen}>
      <PageHeader title="Community" backHref="/community/" compact />
      {id === '' ? (
        <EmptyState sentence="That post isn't here." />
      ) : (
        <LoadState status={status} onRetry={reload}>
          {post ? (
            <>
              <PostBody post={post} />
              <CommentList postId={post.id} />
            </>
          ) : null}
        </LoadState>
      )}
    </div>
  );
}
