'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import {
  createPost,
  isNicknameRequired,
  isOffline,
  routineToPayload,
  storyToPayload,
  type PostKind,
} from '@/lib/data/community';
import { useStory } from '@/lib/data/stories';
import { useActivity } from '@/lib/data/activities';
import { pickAndStoreImage, useMediaUrl } from '@/lib/data/media';
import { useSyncStatus } from '@/lib/sync/engine';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { VoiceRecorder } from '@/components/story/VoiceRecorder';
import { useCommunityGate } from './communityGate';
import styles from './PostComposer.module.css';

const TITLE_MAX = 120;
const BODY_MAX = 5000;
const IMAGE_MAX = 6;

function Thumb({ mediaId, onRemove }: { mediaId: string; onRemove: () => void }) {
  const url = useMediaUrl(mediaId);
  return (
    <li className={styles.thumb}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      {url ? <img className={styles.thumbImg} src={url} alt="" /> : null}
      <button type="button" className={styles.thumbRemove} aria-label="Remove this picture" onClick={onRemove}>
        <Icon name="close" size={20} />
      </button>
    </li>
  );
}

/** Write a post, or share one of your own stories or routines (`?kind=story|routine&id=`). */
export function PostComposer() {
  const router = useRouter();
  const params = useSearchParams();
  const requirePin = useCommunityGate();
  const offline = isOffline(useSyncStatus().state);
  const { profile } = useActiveProfile();
  const bodyId = useId();

  const shareKind = params.get('kind') === 'story' ? 'story' : params.get('kind') === 'routine' ? 'routine' : null;
  const shareId = params.get('id') ?? '';
  const { story, pages } = useStory(shareKind === 'story' ? shareId : '');
  const activity = useActivity(shareKind === 'routine' ? shareId : '');
  const steps = useLiveQuery(
    () => (shareKind === 'routine' && shareId ? db.activity_steps.where('activity_id').equals(shareId).toArray() : []),
    [shareKind, shareId],
    [],
  );

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [sending, setSending] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharing = shareKind !== null;
  const sharedName = shareKind === 'story' ? story?.title : activity?.name;
  const shareReady = shareKind === 'story' ? Boolean(story && pages) : shareKind === 'routine' ? Boolean(activity) : true;
  const storyHasAudio = shareKind === 'story' && (pages ?? []).some((p) => p.audio_id);
  const canSend = shareReady && (sharing || title.trim() !== '' || body.trim() !== '' || images.length > 0 || audioId !== null);

  async function addImages(files: FileList | null): Promise<void> {
    if (!files) return;
    try {
      const ids: string[] = [];
      for (const file of Array.from(files).slice(0, IMAGE_MAX - images.length)) ids.push(await pickAndStoreImage(file));
      setImages((prev) => [...prev, ...ids]);
    } catch {
      toast("Couldn't use that picture. Try another one.");
    }
  }

  async function send(): Promise<void> {
    if (!(await requirePin())) return;
    const kind: PostKind = shareKind ?? 'post';
    const payload =
      shareKind === 'story' && story && pages
        ? storyToPayload(story, pages, includeAudio)
        : shareKind === 'routine' && activity
          ? routineToPayload(activity, steps)
          : null;
    setSending(true);
    setError(null);
    setNeedsNickname(false);
    try {
      const post = await createPost({
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        payload,
        // A plain post's own recording is the point of the post; a story's recordings go only when the switch is on.
        include_audio: shareKind === 'story' ? includeAudio : audioId !== null,
        media: [
          ...images.map((media_id) => ({ media_id, kind: 'image' as const })),
          ...(audioId ? [{ media_id: audioId, kind: 'audio' as const }] : []),
        ],
        author_profile_id: profile?.id ?? null,
      });
      router.replace(`/community/post/?id=${post.id}`);
    } catch (e) {
      if (isNicknameRequired(e)) setNeedsNickname(true);
      else setError("Your post didn't send. Check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <div className={styles.screen}>
      <PageHeader title={sharing ? 'Share to community' : 'New post'} backHref="/community/" compact />
      {offline ? (
        <EmptyState picture={<Icon name="sync" size={48} />} sentence="You're offline. Community needs a connection." />
      ) : (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className={styles.note}>Everyone can read this. It shows your community nickname only.</p>
          {sharing ? (
            <p className={styles.shared}>
              Sharing {shareKind === 'story' ? 'social story' : 'routine'}: <strong>{sharedName ?? '...'}</strong>. Others get their own copy.
            </p>
          ) : null}
          <TextField label={sharing ? 'Title (optional)' : 'Title'} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          <Field label={sharing ? 'Message (optional)' : 'What do you want to share?'} htmlFor={bodyId}>
            <textarea
              id={bodyId}
              className={styles.textarea}
              rows={5}
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          {sharing ? null : (
            <>
              {images.length > 0 ? (
                <ul className={styles.thumbs}>
                  {images.map((id) => (
                    <Thumb key={id} mediaId={id} onRemove={() => setImages((prev) => prev.filter((x) => x !== id))} />
                  ))}
                </ul>
              ) : null}
              {images.length < IMAGE_MAX ? (
                <label className={styles.picker}>
                  <Icon name="image" size={24} /> Add pictures
                  <input
                    className={styles.fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      void addImages(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : null}
              <VoiceRecorder audioId={audioId} onChange={setAudioId} label="your post" />
            </>
          )}

          {storyHasAudio ? (
            <div className={styles.switchRow}>
              <div>
                <p className={styles.switchTitle}>Include the recorded voice</p>
                <p className={styles.hint}>Off by default. Recordings can hold a real voice.</p>
              </div>
              <Switch checked={includeAudio} onChange={setIncludeAudio} label="Include the recorded voice" />
            </div>
          ) : null}

          {needsNickname ? (
            <p className={styles.error} role="alert">
              Pick a community nickname before you post. <Link href="/settings/community/">Set a nickname</Link>
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" fullWidth loading={sending} disabled={!canSend}>
            Post
          </Button>
        </form>
      )}
    </div>
  );
}
