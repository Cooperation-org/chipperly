'use client';

import { useState } from 'react';
import { useStories, useStory } from '@/lib/data/stories';
import { Picture } from '@/components/media/Picture';
import { StoryViewer } from '@/components/story/StoryViewer';
import styles from './ChildToday.module.css';

function Viewer({ id, onClose }: { id: string; onClose: () => void }) {
  const { story, pages } = useStory(id);
  if (!story || !pages || pages.length === 0) return null;
  return <StoryViewer story={story} pages={pages} onClose={onClose} />;
}

/** The child's story shelf: big covers, tap to read. Reading only, nothing to edit. */
export function StoriesSheet({ profileId }: { profileId: string }) {
  const stories = useStories(profileId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (stories.length === 0) return <p className={styles.emptyText}>No stories yet</p>;
  return (
    <>
      <ul className={styles.locationList}>
        {stories.map((story) => (
          <li key={story.id}>
            <button type="button" className={styles.locationTile} aria-label={story.title} onClick={() => setOpenId(story.id)}>
              <Picture emoji={story.emoji} photo_id={story.cover_photo_id} name={story.title} size="child" />
              <span>{story.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {openId ? <Viewer id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
