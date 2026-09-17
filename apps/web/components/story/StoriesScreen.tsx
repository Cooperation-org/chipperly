'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SocialStory } from '@chipperly/shared/schemas/story';
import type { StoryTemplateKey } from '@chipperly/shared/constants/storyTemplates';
import { useActiveProfile } from '@/lib/profile/active';
import { useStories, useStory, deleteStory, duplicateStory, createFromTemplate } from '@/lib/data/stories';
import { restore } from '@/lib/sync/mutate';
import { toast } from '@/lib/toast';
import { useSheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Picture } from '@/components/media/Picture';
import { StoryViewer } from './StoryViewer';
import styles from './StoriesScreen.module.css';

const TEMPLATES: { key: StoryTemplateKey; label: string }[] = [
  { key: 'haircut', label: 'Haircut' },
  { key: 'doctor', label: 'Doctor visit' },
  { key: 'new_place', label: 'New place' },
  { key: 'big_day', label: 'Big day' },
];

function StoryViewerHost({ id, onClose }: { id: string; onClose: () => void }) {
  const { story, pages } = useStory(id);
  if (!story) return null;
  return <StoryViewer story={story} pages={pages} onClose={onClose} />;
}

/** S16: the Stories grid, its empty state with starter templates, and each cover's overflow menu. */
export function StoriesScreen() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const stories = useStories(profile?.id ?? '');
  const sheet = useSheet();
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (!profile) return null;
  const profileId = profile.id;

  async function startTemplate(key: StoryTemplateKey): Promise<void> {
    const storyId = await createFromTemplate(profileId, key);
    router.push(`/story/edit/?id=${storyId}`);
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

      {stories.length === 0 ? (
        <>
          <EmptyState sentence="No stories yet" />
          <section className={styles.templates}>
            <h2 className={styles.sectionLabel}>Start from a template</h2>
            <div className={styles.templateRow}>
              {TEMPLATES.map((t) => (
                <Button key={t.key} variant="secondary" onClick={() => void startTemplate(t.key)}>
                  {t.label}
                </Button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className={styles.grid}>
          <button type="button" className={styles.newTile} onClick={() => router.push('/story/edit/')}>
            <span className={styles.newIcon}>
              <Icon name="plus" size={24} />
            </span>
            <span>New story</span>
          </button>
          {stories.map((story) => (
            <div key={story.id} className={styles.cover}>
              <button type="button" className={styles.coverMain} onClick={() => setViewingId(story.id)} aria-label={story.title}>
                <Picture emoji={story.emoji} photo_id={story.cover_photo_id} name={story.title} size="grid" />
                <span className={styles.coverTitle} title={story.title}>
                  {story.title}
                </span>
              </button>
              <button type="button" className={styles.more} onClick={() => openMore(story)} aria-label={`More for ${story.title}`}>
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {viewingId ? <StoryViewerHost id={viewingId} onClose={() => setViewingId(null)} /> : null}
    </div>
  );
}
