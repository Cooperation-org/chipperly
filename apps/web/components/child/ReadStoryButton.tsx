'use client';

import { useState } from 'react';
import { useStory } from '@/lib/data/stories';
import { Icon } from '@/components/ui/Icon';
import { StoryViewer } from '@/components/story/StoryViewer';
import styles from './ReadStoryButton.module.css';

export interface ReadStoryButtonProps {
  storyId: string;
}

/** S32 row extra: opens the item's attached story full screen; Close returns to Today. Hidden
 * while the story hasn't loaded yet or has no pages (nothing for StoryViewer to show). */
export function ReadStoryButton({ storyId }: ReadStoryButtonProps) {
  const { story, pages } = useStory(storyId);
  const [open, setOpen] = useState(false);

  if (!story || !pages || pages.length === 0) return null;

  return (
    <>
      <button type="button" className={styles.button} onClick={() => setOpen(true)}>
        <Icon name="book" size={24} />
        Read story
      </button>
      {open ? <StoryViewer story={story} pages={pages} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
