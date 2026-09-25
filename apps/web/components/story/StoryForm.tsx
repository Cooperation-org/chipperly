'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SocialStory, StoryPage } from '@chipperly/shared/schemas/story';
import { useActiveProfile } from '@/lib/profile/active';
import { useStory, saveStory, deleteStory } from '@/lib/data/stories';
import { restore } from '@/lib/sync/mutate';
import { newId } from '@/lib/ids';
import { toast } from '@/lib/toast';
import { useSheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { BigButton } from '@/components/ui/BigButton';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Field } from '@/components/ui/Field';
import { Picture } from '@/components/media/Picture';
import { PicturePicker } from '@/components/picture/PicturePicker';
import type { PicturePickerValue } from '@/components/picture/PicturePicker';
import { StoryViewer } from './StoryViewer';
import { VoiceRecorder } from './VoiceRecorder';
import styles from './StoryForm.module.css';

interface DraftPage {
  id: string;
  text: string;
  emoji: string | null;
  photo_id: string | null;
  audio_id: string | null;
}

/** S18: title, cover, an ordered list of pages, preview, and a sticky save. Handles both create
 * (no `?id=`, blank draft) and edit (loads the existing story once and edits a local draft). */
export function StoryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { profile } = useActiveProfile();
  const { story, pages } = useStory(id ?? '');
  const sheet = useSheet();

  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<PicturePickerValue>({});
  const [draftPages, setDraftPages] = useState<DraftPage[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    // `pages` loads via its own liveQuery, independently of `story` (see
    // useStory's comment) — wait for both before hydrating, and before
    // latching `hydrated.current`, or a save made while pages is still
    // "loading" would submit an empty page list and delete the real ones.
    if (!id || hydrated.current || !story || !pages) return;
    hydrated.current = true;
    setTitle(story.title);
    setCover({ emoji: story.emoji, photo_id: story.cover_photo_id });
    setDraftPages(pages.map((p) => ({ id: p.id, text: p.text, emoji: p.emoji, photo_id: p.photo_id, audio_id: p.audio_id ?? null })));
  }, [id, story, pages]);

  if (!profile) return null;
  const profileId = profile.id;

  function updatePage(pageId: string, patch: Partial<DraftPage>): void {
    setDraftPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, ...patch } : p)));
  }

  function addPage(): void {
    setDraftPages((prev) => [...prev, { id: newId(), text: '', emoji: null, photo_id: null, audio_id: null }]);
  }

  function removePage(pageId: string): void {
    const removed = draftPages.find((p) => p.id === pageId);
    setDraftPages((prev) => prev.filter((p) => p.id !== pageId));
    if (removed) {
      // ponytail: undo re-appends the page at the end rather than its exact old position; good
      // enough for a single removal, upgrade to index-preserving undo if that starts to bother people.
      toast('Page removed', { undo: () => setDraftPages((prev) => [...prev, removed]) });
    }
  }

  function movePage(pageId: string, dir: -1 | 1): void {
    setDraftPages((prev) => {
      const index = prev.findIndex((p) => p.id === pageId);
      const swapIndex = index + dir;
      if (index < 0 || swapIndex < 0 || swapIndex >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index] as DraftPage;
      next[index] = next[swapIndex] as DraftPage;
      next[swapIndex] = moved;
      return next;
    });
  }

  function openPagePicker(page: DraftPage, label: string): void {
    sheet.open(
      <PicturePicker
        value={{ emoji: page.emoji, photo_id: page.photo_id }}
        onChange={(v) => {
          updatePage(page.id, { emoji: v.emoji ?? null, photo_id: v.photo_id ?? null });
          sheet.close();
        }}
        name={label}
      />,
      { title: label },
    );
  }

  async function handleSave(): Promise<void> {
    await saveStory({
      id: id ?? undefined,
      profile_id: profileId,
      title: title.trim() || 'Untitled story',
      emoji: cover.emoji ?? null,
      cover_photo_id: cover.photo_id ?? null,
      pages: draftPages.map((p) => ({ id: p.id, text: p.text, emoji: p.emoji, photo_id: p.photo_id, audio_id: p.audio_id })),
    });
    router.push('/stories/');
  }

  async function handleDelete(): Promise<void> {
    if (!id) return;
    await deleteStory(id);
    toast(`${title || 'Story'} deleted`, { undo: () => void restore('social_stories', id) });
    router.push('/stories/');
  }

  const previewStory: SocialStory = {
    id: id ?? 'draft',
    profile_id: profileId,
    version: 0,
    client_updated_at: 0,
    updated_by: '',
    deleted_at: null,
    title,
    emoji: cover.emoji ?? null,
    cover_photo_id: cover.photo_id ?? null,
    position: story?.position ?? 0,
  };
  const previewPages: StoryPage[] = draftPages.map((p, i) => ({
    id: p.id,
    profile_id: profileId,
    version: 0,
    client_updated_at: 0,
    updated_by: '',
    deleted_at: null,
    story_id: previewStory.id,
    position: i,
    text: p.text,
    emoji: p.emoji,
    photo_id: p.photo_id,
    audio_id: p.audio_id,
  }));

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <IconButton icon="arrowLeft" aria-label="Back" onClick={() => router.push('/stories/')} />
        <h1 className={styles.title}>{id ? 'Edit story' : 'New story'}</h1>
        <Button variant="secondary" onClick={() => setPreviewOpen(true)} disabled={draftPages.length === 0}>
          Preview
        </Button>
      </div>

      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />

      <Field label="Cover">
        <PicturePicker value={cover} onChange={setCover} name={title || 'Cover'} />
      </Field>

      <section className={styles.pages}>
        <h2 className={styles.sectionLabel}>Pages ({draftPages.length})</h2>
        {draftPages.map((page, i) => (
          <div key={page.id} className={styles.pageRow}>
            <button
              type="button"
              className={styles.pageTile}
              onClick={() => openPagePicker(page, `Page ${i + 1} picture`)}
              aria-label={`Change picture for page ${i + 1}`}
            >
              <Picture emoji={page.emoji} photo_id={page.photo_id} name={page.text || `Page ${i + 1}`} size="list" />
            </button>
            <textarea
              className={styles.pageText}
              rows={2}
              maxLength={120}
              value={page.text}
              onChange={(e) => updatePage(page.id, { text: e.target.value })}
              aria-label={`Page ${i + 1} text`}
            />
            <div className={styles.pageVoice}>
              <VoiceRecorder audioId={page.audio_id} onChange={(audio_id) => updatePage(page.id, { audio_id })} label={`page ${i + 1}`} />
            </div>
            <div className={styles.pageActions}>
              <IconButton
                icon="chevron"
                aria-label={`Move page ${i + 1} up`}
                onClick={() => movePage(page.id, -1)}
                disabled={i === 0}
                className={styles.up}
              />
              <IconButton
                icon="chevron"
                aria-label={`Move page ${i + 1} down`}
                onClick={() => movePage(page.id, 1)}
                disabled={i === draftPages.length - 1}
                className={styles.down}
              />
              <IconButton icon="close" aria-label={`Remove page ${i + 1}`} onClick={() => removePage(page.id)} />
            </div>
          </div>
        ))}
        <Button variant="secondary" fullWidth icon="plus" onClick={addPage}>
          Add page
        </Button>
      </section>

      {id ? (
        <Button variant="danger" onClick={() => void handleDelete()}>
          Delete
        </Button>
      ) : null}

      <div className={styles.saveBar}>
        <BigButton variant="primary" fullWidth onClick={() => void handleSave()}>
          Save
        </BigButton>
      </div>

      {previewOpen ? <StoryViewer story={previewStory} pages={previewPages} onClose={() => setPreviewOpen(false)} /> : null}
    </div>
  );
}
