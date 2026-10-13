'use client';

import { useCanEdit } from '@/lib/auth/permissions';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SocialStory } from '@chipperly/shared/schemas/story';
import type { StoryTemplateKey } from '@chipperly/shared/constants/storyTemplates';
import { useActiveProfile } from '@/lib/profile/active';
import { useStories, useStory, deleteStory, duplicateStory, createFromTemplate } from '@/lib/data/stories';
import { createFromImages, PdfOpenError } from '@/lib/data/storyUpload';
import { PDF_PAGE_LIMIT } from '@/lib/media/pdfPages';
import { CANT_OPEN_PHOTO, PhotoDecodeError } from '@/lib/media/imageFile';
import { restore } from '@/lib/sync/mutate';
import { toast } from '@/lib/toast';
import { useSheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Picture } from '@/components/media/Picture';
import { StoryViewer } from './StoryViewer';
import styles from './StoriesScreen.module.css';
import { ScreenHint } from '@/components/ui/ScreenHint';

const UPLOAD_NOTE = `Pick a PDF, or a picture of each page. A PDF becomes one page per PDF page (up to ${PDF_PAGE_LIMIT}).`;
const NO_PICTURES = 'Pick a PDF or pictures (JPG, PNG or HEIC).';

const TEMPLATES: { key: StoryTemplateKey; label: string }[] = [
  { key: 'haircut', label: 'Haircut' },
  { key: 'doctor', label: 'Doctor visit' },
  { key: 'new_place', label: 'New place' },
  { key: 'big_day', label: 'Big day' },
];

function StoryViewerHost({ id, onClose }: { id: string; onClose: () => void }) {
  const { story, pages } = useStory(id);
  if (!story || !pages) return null;
  return <StoryViewer story={story} pages={pages} onClose={onClose} />;
}

/** S16: the Stories grid, its empty state with starter templates, and each cover's overflow menu. */
export function StoriesScreen() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const stories = useStories(profile?.id ?? '');
  const canEdit = useCanEdit();
  const sheet = useSheet();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!profile) return null;
  const profileId = profile.id;

  async function startTemplate(key: StoryTemplateKey): Promise<void> {
    const storyId = await createFromTemplate(profileId, key);
    router.push(`/story/edit/?id=${storyId}`);
  }

  async function uploadStory(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const made = await createFromImages(profileId, Array.from(files));
      if (!made) {
        toast(NO_PICTURES);
        return;
      }
      const notes: string[] = [];
      if (made.cantOpen.length > 0) notes.push(`${made.cantOpen.join(', ')}: ${CANT_OPEN_PHOTO}`);
      if (made.cantOpenPdf.length > 0) notes.push(new PdfOpenError(made.cantOpenPdf).message);
      const unread = made.skipped - made.cantOpen.length;
      if (unread > 0) {
        notes.push(unread === 1 ? '1 picture could not be read and was left out.' : `${unread} pictures could not be read and were left out.`);
      }
      // carry: shown on the story editor this opens, not cleared by the route change.
      if (notes.length > 0) toast(notes.join(' '), { carry: true });
      router.push(`/story/edit/?id=${made.storyId}`);
    } catch (err) {
      toast(err instanceof PhotoDecodeError ? CANT_OPEN_PHOTO : err instanceof PdfOpenError ? err.message : 'Could not read those pictures. Try JPG or PNG files.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(story: SocialStory): Promise<void> {
    await deleteStory(story.id);
    toast(`${story.title} deleted`, { undo: () => void restore('social_stories', story.id) });
  }

  function openMore(story: SocialStory): void {
    sheet.open(
      <div className={styles.moreSheet}>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            sheet.close();
            router.push(`/story/edit/?id=${story.id}`);
          }}
        >
          Edit
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            sheet.close();
            void duplicateStory(story.id);
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          fullWidth
          onClick={() => {
            sheet.close();
            void handleDelete(story);
          }}
        >
          Delete
        </Button>
      </div>,
      { title: story.title },
    );
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.heading}>Stories</h1>
      <ScreenHint id="stories" title="Writing social stories" body="A short story with pictures helps someone get ready for something new. Read it together on a calm day." section="stories" />

      {canEdit ? (
        <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.heic,.heif,application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          void uploadStory(e.target.files);
          e.target.value = '';
        }}
      />
      <div className={styles.upload}>
        <Button variant="secondary" icon="plus" loading={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? 'Adding pictures…' : 'Add a story I already have'}
        </Button>
        <p className={styles.uploadNote}>{UPLOAD_NOTE}</p>
      </div>
        </>
      ) : null}

      {stories.length === 0 ? (
        <>
          <EmptyState sentence="No stories yet" />
          {canEdit ? <section className={styles.templates}>
            <h2 className={styles.sectionLabel}>Start from a template</h2>
            <div className={styles.templateRow}>
              {TEMPLATES.map((t) => (
                <Button key={t.key} variant="secondary" onClick={() => void startTemplate(t.key)}>
                  {t.label}
                </Button>
              ))}
            </div>
          </section> : null}
        </>
      ) : (
        <div className={styles.grid}>
          {canEdit ? (
            <button type="button" className={styles.newTile} onClick={() => router.push('/story/edit/')}>
              <span className={styles.newIcon}>
                <Icon name="plus" size={24} />
              </span>
              <span>New story</span>
            </button>
          ) : null}
          {stories.map((story) => (
            <div key={story.id} className={styles.cover}>
              <button type="button" className={styles.coverMain} onClick={() => setViewingId(story.id)} aria-label={story.title}>
                <Picture emoji={story.emoji} photo_id={story.cover_photo_id} name={story.title} size="grid" />
                <span className={styles.coverTitle} title={story.title}>
                  {story.title}
                </span>
              </button>
              {canEdit ? (
                <button type="button" className={styles.more} onClick={() => openMore(story)} aria-label={`More for ${story.title}`}>
                  <span aria-hidden="true">⋯</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {viewingId ? <StoryViewerHost id={viewingId} onClose={() => setViewingId(null)} /> : null}
    </div>
  );
}
